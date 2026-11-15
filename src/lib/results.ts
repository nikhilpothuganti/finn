import { z } from "zod";
import { hasLLM, structured } from "./llm";
import { pct, resultsCut, type ResultsCut } from "./metrics";
import { cacheGet, cacheSet } from "./cache";
import { pdfText } from "./sources/documents";
import { monthKey } from "./research";
import type { CompanySnapshot, Filing } from "./types";

// Results first-cut, taken from the actual results filing (as the brief asks), not from an
// aggregator that can lag by days. A results PDF prints three columns side by side —
// this quarter, last quarter, same quarter last year — so one cheap extraction gives QoQ and YoY.
// EBITDA is never asked of the model: we compute it from the extracted lines
// (PBT + finance costs + depreciation − other income), so the arithmetic is auditable.

const Col = z.object({
  revenue: z.number().nullable(),
  other_income: z.number().nullable(),
  finance_costs: z.number().nullable(),
  depreciation: z.number().nullable(),
  pbt: z.number().nullable(),
  pat: z.number().nullable(),
});
const FilingResults = z.object({
  basis: z.enum(["consolidated", "standalone"]),
  unit: z.string().describe("e.g. '₹ crore', '₹ lakh', '₹ million'"),
  current: Col.extend({ label: z.string() }),
  previous: Col.extend({ label: z.string() }),
  year_ago: Col.extend({ label: z.string() }),
});

const KEYWORDS = /revenue from operations|total income|finance cost|depreciation|profit before tax|net profit|profit for the (period|quarter)|quarter ended|three months ended/i;

/** Keep only the statement pages: P&L tables are a small slice of a 20-page results PDF. */
function statementSlice(text: string, budget = 14000) {
  const chunks = text.match(/[\s\S]{1,1200}/g) ?? [];
  const scored = chunks.map((t, i) => ({ i, t, s: (t.match(new RegExp(KEYWORDS, "gi")) ?? []).length }));
  // prefer consolidated statements if present
  const firstConsol = scored.findIndex((c) => /consolidated/i.test(c.t) && c.s >= 2);
  const ordered = [...scored].sort((a, b) => b.s - a.s || Math.abs(a.i - firstConsol) - Math.abs(b.i - firstConsol));
  const keep: typeof scored = [];
  let used = 0;
  for (const c of ordered) {
    if (c.s === 0 || used + c.t.length > budget) continue;
    keep.push(c);
    used += c.t.length;
  }
  return keep.sort((a, b) => a.i - b.i).map((c) => c.t).join("\n…\n");
}

const toCrore = (unit: string) => (/lakh|lac/i.test(unit) ? 0.01 : /million|mn/i.test(unit) ? 0.1 : /billion/i.test(unit) ? 100 : 1);

export interface ResultsView extends ResultsCut {
  source: "filing" | "screener";
  basis?: string;
  note?: string;
}

export async function resultsForFiling(c: CompanySnapshot, f: Filing, opts: { live?: boolean } = {}): Promise<ResultsView | null> {
  const fallback = resultsCut(c);
  // Finished cards are cached per filing (committed by precompute) so the request path never waits on a PDF or model.
  const hit = await cacheGet<ResultsView>("results", f.id);
  if (hit) return hit;
  if (opts.live && hasLLM() && f.url.startsWith("http")) {
    try {
      const text = statementSlice(await pdfText(f.url));
      if (text.length > 1000) {
        const r = await structured({
          tier: "fast",
          task: "results-v2",
          commit: true,
          schema: FilingResults,
          system:
            "Extract the quarterly P&L from an Indian listed company's results filing. Use the CONSOLIDATED statement if " +
            "present, else standalone. Columns: current quarter, immediately preceding quarter, same quarter previous year. " +
            "Copy numbers exactly as printed (no unit conversion); losses are negative. Use null if a line is absent. " +
            "For banks, revenue = total interest earned. Each column label must be the period as printed, normalised like " +
            "'Sep 2026' (month of quarter end + year).",
          user: text,
        });
        const k = toCrore(r.unit);
        const ebitda = (x: z.infer<typeof Col>) =>
          x.pbt == null ? null : x.pbt + (x.finance_costs ?? 0) + (x.depreciation ?? 0) - (x.other_income ?? 0);
        const line = (key: "revenue" | "ebitda" | "pbt" | "pat", label: string) => {
          const get = (x: z.infer<typeof Col>) => {
            const v = key === "ebitda" ? ebitda(x) : x[key];
            return v == null ? null : v * k;
          };
          const cur = get(r.current);
          return { key, label, value: cur, qoq: pct(cur, get(r.previous)), yoy: pct(cur, get(r.year_ago)) };
        };
        const lines = [line("revenue", "Revenue"), line("ebitda", "EBITDA"), line("pbt", "PBT"), line("pat", "PAT")];
        const m = (x: z.infer<typeof Col>) => (x.revenue && x.pat != null ? (x.pat / x.revenue) * 100 : null);
        const now = m(r.current);
        const then = m(r.year_ago);
        // Sanity gate: real period labels, positive revenue, PAT not larger than revenue. Otherwise fall back.
        const periodOk = [r.current.label, r.previous.label, r.year_ago.label].every((l) => /(19|20)\d{2}/.test(l));
        // Must be at least as recent as the latest standardised quarter, or we've read the wrong document.
        const cur = monthKey(r.current.label);
        const std = fallback ? monthKey(fallback.period) : null;
        const fresh = !cur || !std || cur >= std;
        const sane = lines[0].value != null && lines[0].value > 0 && Math.abs(lines[3].value ?? 0) < lines[0].value;
        if (periodOk && sane && fresh) {
          const view: ResultsView = {
            source: "filing",
            basis: r.basis,
            period: r.current.label,
            prevPeriod: r.previous.label,
            yoyPeriod: r.year_ago.label,
            lines,
            margin: { label: "PAT margin", now, yoyBps: now != null && then != null ? Math.round((now - then) * 100) : null },
          };
          await cacheSet("results", f.id, view, { commit: true });
          return view;
        }
      }
    } catch {
      /* fall back below */
    }
  }
  if (!fallback) return null;
  // Is the standardised table behind the filing? Say so instead of showing an old quarter as new.
  const filedFor = f.title.match(/(?:ended|ending)\s+(?:on\s+)?(\d{1,2}(?:st|nd|rd|th)?\s+)?([a-z]+)\w*\s*,?\s*(\d{4})/i);
  const note =
    filedFor && !fallback.period.toLowerCase().startsWith(filedFor[2].slice(0, 3).toLowerCase())
      ? `Filing is for ${filedFor[2][0].toUpperCase()}${filedFor[2].slice(1, 3).toLowerCase()} ${filedFor[3]}; standardised numbers below are for ${fallback.period} until the aggregator updates.`
      : undefined;
  return { ...fallback, source: "screener", note };
}
