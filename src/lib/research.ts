import { z } from "zod";
import { structured } from "./llm";
import { fmtPct, isLender, pct, priceSignal, resultsCut, row } from "./metrics";
import { guidancePassages, pdfText } from "./sources/documents";
import type { CompanySnapshot, Table } from "./types";

// PULL — on-demand research grounded only in primary data:
//   numbers  ← the company's reported financials (via Screener's standardised tables)
//   words    ← the company's own concall transcripts (BSE-hosted PDFs)
// No news, broker notes, or model world-knowledge: prompts forbid it and only pass these inputs.

// ---------- Layer 1: deterministic numbers ----------

const last = <T,>(a: T[], n = 1) => a[a.length - n];
const cagr = (end: number | null | undefined, start: number | null | undefined, years: number) =>
  end && start && start > 0 && end > 0 ? (Math.pow(end / start, 1 / years) - 1) * 100 : null;

export interface Flag {
  tone: "good" | "bad" | "watch";
  text: string;
}

function series(t: Table, key: string, n: number) {
  const r = row(t, key);
  const periods = t.periods;
  // drop trailing TTM column if present
  const end = periods.at(-1) === "TTM" ? periods.length - 1 : periods.length;
  return periods.slice(Math.max(0, end - n), end).map((p, i) => ({ p, v: r[Math.max(0, end - n) + i] ?? null }));
}

export function numbers(c: CompanySnapshot) {
  const lender = isLender(c);
  const flags: Flag[] = [];
  const A = c.annual;
  const rev = series(A, "revenue", 6);
  const pat = series(A, "pat", 6);
  const ebitda = series(A, "ebitda", 6);
  const revC3 = cagr(last(rev)?.v, rev[rev.length - 4]?.v, 3);
  const revC5 = cagr(last(rev)?.v, rev[0]?.v, rev.length - 1);
  const patC3 = cagr(last(pat)?.v, pat[pat.length - 4]?.v, 3);
  const margins = rev.map((r, i) => {
    const patM = r.v && pat[i].v != null ? (pat[i].v! / r.v) * 100 : null;
    return { p: r.p, ebitda: lender ? patM : r.v && ebitda[i].v != null ? (ebitda[i].v! / r.v) * 100 : null, pat: patM };
  });
  const mNow = last(margins)?.ebitda;
  const mThen = margins[margins.length - 4]?.ebitda;
  if (revC3 != null && patC3 != null) {
    if (patC3 > revC3 + 3) flags.push({ tone: "good", text: `Operating leverage: PAT compounding ${patC3.toFixed(0)}% vs revenue ${revC3.toFixed(0)}% (3y)` });
    if (patC3 < revC3 - 5) flags.push({ tone: "bad", text: `Profits lagging sales: PAT ${patC3.toFixed(0)}% vs revenue ${revC3.toFixed(0)}% CAGR (3y)` });
  }
  if (!lender && mNow != null && mThen != null && Math.abs(mNow - mThen) >= 2)
    flags.push({ tone: mNow > mThen ? "good" : "bad", text: `${lender ? "Financing" : "EBITDA"} margin ${mNow > mThen ? "expanded" : "compressed"} ${Math.abs(mNow - mThen).toFixed(1)} pts over 3 years` });

  // Balance sheet
  const B = c.balance;
  const bs = series(B, "Equity Capital", 6).map((e, i) => {
    const res = series(B, "Reserves", 6)[i]?.v ?? 0;
    const debt = series(B, lender ? "Borrowing" : "Borrowings", 6)[i]?.v ?? 0;
    const equity = (e.v ?? 0) + res;
    return { p: e.p, equity, debt, de: equity ? debt / equity : null };
  });
  const deNow = last(bs)?.de ?? null;
  const dePrev = bs[bs.length - 4]?.de ?? null;
  if (!lender && deNow != null) {
    if (deNow > 1) flags.push({ tone: "bad", text: `Leveraged: debt/equity ${deNow.toFixed(2)}×` });
    else if (deNow < 0.1) flags.push({ tone: "good", text: `Virtually debt-free (D/E ${deNow.toFixed(2)}×)` });
    if (dePrev != null && deNow - dePrev > 0.3) flags.push({ tone: "watch", text: `Leverage rising: D/E ${dePrev.toFixed(2)}× → ${deNow.toFixed(2)}× in 3 years` });
  }

  // Cash quality
  const cfo = series(c.cashflow, "Cash from Operating Activity", 6);
  const fcf = series(c.cashflow, "Free Cash Flow", 6);
  const cumCfo = cfo.slice(-5).reduce((s, x) => s + (x.v ?? 0), 0);
  const cumPat = pat.slice(-5).reduce((s, x) => s + (x.v ?? 0), 0);
  const conversion = cumPat > 0 ? cumCfo / cumPat : null;
  if (!lender && conversion != null) {
    if (conversion < 0.7) flags.push({ tone: "bad", text: `Weak cash conversion: only ${(conversion * 100).toFixed(0)}% of 5-yr profit turned into operating cash` });
    else if (conversion > 1) flags.push({ tone: "good", text: `Profits are real: 5-yr operating cash ${(conversion * 100).toFixed(0)}% of PAT` });
  }

  // Working capital
  const ccc = series(c.efficiency, "Cash Conversion Cycle", 6);
  const debtor = series(c.efficiency, "Debtor Days", 6);
  const dNow = last(debtor)?.v;
  const dThen = debtor[debtor.length - 4]?.v;
  if (!lender && dNow != null && dThen != null && dThen > 0 && dNow > dThen * 1.25 && dNow - dThen > 10)
    flags.push({ tone: "watch", text: `Receivables stretching: debtor days ${dThen.toFixed(0)} → ${dNow.toFixed(0)} in 3 years` });

  // Quarterly momentum (last 8)
  const Q = c.quarters;
  const qrev = series(Q, "revenue", 9);
  const qpat = series(Q, "pat", 9);
  const qebitda = series(Q, "ebitda", 9);
  const quarters = qrev.slice(-8).map((r, k) => {
    const i = qrev.length - 8 + k;
    return {
      p: r.p,
      revenue: r.v,
      revYoY: pct(r.v, row(Q, "revenue")[Q.periods.indexOf(r.p) - 4]),
      // Lenders: Screener's "financing profit" is post-provision and can go negative → show PAT margin.
      margin: r.v ? (lender ? (qpat[i]?.v != null ? (qpat[i].v! / r.v) * 100 : null) : qebitda[i]?.v != null ? (qebitda[i].v! / r.v) * 100 : null) : null,
      pat: qpat[i]?.v ?? null,
    };
  });

  const sig = priceSignal(c);
  return {
    lender,
    snapshot: {
      ratios: c.ratios,
      latest: resultsCut(c),
      price: sig ? { close: sig.close, changePct: sig.changePct, date: sig.date } : null,
    },
    trajectory: { rev, pat, margins, revC3, revC5, patC3 },
    balance: bs,
    cash: { cfo, fcf, conversion },
    workingCapital: { ccc, debtor },
    quarters,
    flags,
  };
}

// ---------- Layer 2: transcripts → promises → verdicts ----------

const GuidanceSchema = z.object({
  statements: z.array(
    z.object({
      topic: z.enum(["revenue_growth", "margin", "capex", "volume_or_orders", "segment", "balance_sheet", "other"]),
      horizon: z.string().describe("e.g. 'FY27', 'next quarter', 'H2 FY27', 'medium term'"),
      quote: z.string().describe("short verbatim excerpt from the passage"),
      target: z.string().describe("the commitment in plain words, with the number if any"),
    }),
  ),
  tone: z.enum(["confident", "measured", "cautious", "defensive"]),
  analyst_pushback: z.array(z.string()).describe("what analysts pressed on, max 3"),
});
export type QuarterGuidance = z.infer<typeof GuidanceSchema> & { period: string; url: string };

const VerdictSchema = z.object({
  credibility_line: z.string().describe("one sentence a PM would remember"),
  promises: z.array(
    z.object({
      said_in: z.string().describe("call month as 'Mon YYYY', e.g. 'Aug 2026'"),
      target_period_end: z.string().describe("last month of the period the promise is about, as 'Mon YYYY'. Indian FY ends in March: FY27 → 'Mar 2027', Q4 FY26 → 'Mar 2026', Q2 FY27 → 'Sep 2026', H1 FY27 → 'Sep 2026'"),
      promise: z.string(),
      delivered: z.string().describe("what the numbers show, citing periods and figures from the data"),
      verdict: z.enum(["delivered", "partly", "missed", "too_early", "unverifiable"]),
    }),
  ),
  narrative_vs_numbers: z.array(z.object({ claim: z.string(), reality: z.string(), agrees: z.boolean() })),
  guidance_now: z.array(z.string()).describe("what management currently guides, from the latest call"),
  bull: z.array(z.string()),
  bear: z.array(z.string()),
  questions: z.array(z.string()).describe("3 sharp questions to ask management or an industry contact"),
});
export type Verdict = z.infer<typeof VerdictSchema> & { credibility: number | null; checked: number };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** "Sep 2026" → 202609 (comparable month index); null if unparseable. */
export function monthKey(label: string): number | null {
  const m = label.toLowerCase().match(/([a-z]{3})[a-z]*\.?\s*'?(\d{2,4})/);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1]);
  if (mi < 0) return null;
  const y = Number(m[2].length === 2 ? `20${m[2]}` : m[2]);
  return y * 100 + mi + 1;
}

/** Time rules enforced in code, not trusted to the model:
 *  - a promise about a period that has not been reported yet → too_early
 *  - a "promise" about a period that ended before the call → a look-back, dropped */
export function enforceTime(v: z.infer<typeof VerdictSchema>, latestReported: string) {
  const latest = monthKey(latestReported);
  const promises = v.promises.flatMap((p) => {
    const said = monthKey(p.said_in);
    let end = monthKey(p.target_period_end);
    // A full-year target ("FY27", no quarter/half named) can't end before that fiscal year's March.
    const fy = p.promise.match(/\bFY\s?'?(\d{2})\b/i);
    if (fy && !/\b(Q[1-4]|H[12])\b/.test(p.promise)) end = Math.max(end ?? 0, (2000 + Number(fy[1])) * 100 + 3);
    // Judged through a proxy metric → not actually verified.
    if (/\bproxy\b|can only (be )?test|used as (a )?proxy|cannot (be )?(directly )?(verified|assessed)/i.test(`${p.promise} ${p.delivered}`) && p.verdict !== "too_early")
      return [{ ...p, verdict: "unverifiable" as const }];
    if (said && end && end < said - 1) return []; // period closed before it was said (allow the quarter just ended)
    if (latest && end && end > latest && p.verdict !== "unverifiable")
      return [{ ...p, verdict: "too_early" as const, delivered: `Not reportable until ${p.target_period_end}. ${p.delivered}` }];
    return [p];
  });
  return { ...v, promises };
}

/** Score is arithmetic over verdicts, not a model's opinion: (delivered + ½·partly) / checkable. */
export function score(v: z.infer<typeof VerdictSchema>): Verdict {
  const checkable = v.promises.filter((p) => ["delivered", "partly", "missed"].includes(p.verdict));
  const pts = checkable.reduce((s, p) => s + (p.verdict === "delivered" ? 1 : p.verdict === "partly" ? 0.5 : 0), 0);
  return { ...v, checked: checkable.length, credibility: checkable.length >= 2 ? Math.round((pts / checkable.length) * 100) / 10 : null };
}

export async function quarterGuidance(c: CompanySnapshot, max = 4, onProgress?: (msg: string) => void) {
  const seen = new Set<string>();
  const calls = c.concalls.filter((x) => x.transcriptUrl && !seen.has(x.period) && seen.add(x.period)).slice(0, max + 2);
  const out: QuarterGuidance[] = [];
  for (const cc of calls) {
    if (out.length >= max) break;
    onProgress?.(`Reading ${cc.period} concall transcript`);
    try {
      const passages = guidancePassages(await pdfText(cc.transcriptUrl!));
      if (passages.length < 200) continue;
      const g = await structured({
        tier: "fast",
        task: "guidance-v2",
        commit: true,
        schema: GuidanceSchema,
        system:
          "You extract forward-looking guidance from excerpts of an Indian listed company's earnings-call transcript. " +
          "Use ONLY the excerpts provided; never add outside knowledge. Capture explicit commitments on growth, margins, capex, " +
          "orders, segments or balance sheet — with numbers wherever stated. Skip generic optimism with no checkable content. " +
          "Prioritise company-level revenue growth, EBITDA/PAT margin and capex commitments (these can be verified against " +
          "reported financials), then segment/volume targets. Also capture any look-back where management states how a prior " +
          "target turned out. Max 8 statements, most material first.",
        user: `Company: ${c.name}\nCall: ${cc.period}\n\nExcerpts:\n${passages}`,
      });
      out.push({ ...g, period: cc.period, url: cc.transcriptUrl! });
    } catch (e) {
      onProgress?.(`Skipped ${cc.period}: ${(e as Error).message.slice(0, 80)}`);
    }
  }
  return out;
}

function numbersBrief(c: CompanySnapshot, n: ReturnType<typeof numbers>) {
  const q = n.quarters
    .map((x) => `${x.p}: revenue ${x.revenue ?? "—"} cr (YoY ${fmtPct(x.revYoY, 0)}), ${n.lender ? "PAT" : "EBITDA"} margin ${x.margin?.toFixed(1) ?? "—"}%, PAT ${x.pat ?? "—"} cr`)
    .join("\n");
  const a = n.trajectory.rev
    .map((r, i) => `${r.p}: revenue ${r.v ?? "—"} cr, PAT ${n.trajectory.pat[i]?.v ?? "—"} cr, EBITDA margin ${n.trajectory.margins[i]?.ebitda?.toFixed(1) ?? "—"}%`)
    .join("\n");
  const inv = row(c.cashflow, "Cash from Investing Activity");
  const fa = row(c.balance, "Fixed Assets");
  const cwip = row(c.balance, "CWIP");
  const cash = n.cash.cfo
    .map((x, i) => {
      const j = c.cashflow.periods.indexOf(x.p);
      const k = c.balance.periods.indexOf(x.p);
      return `${x.p}: CFO ${x.v ?? "—"} cr, FCF ${n.cash.fcf[i]?.v ?? "—"} cr, investing cash ${inv[j] ?? "—"} cr, fixed assets+CWIP ${k >= 0 ? (fa[k] ?? 0) + (cwip[k] ?? 0) : "—"} cr`;
    })
    .join("\n");
  return `QUARTERLY (reported, ₹ cr):\n${q}\n\nANNUAL:\n${a}\n\nCASH FLOW:\n${cash}\n\nDEBT/EQUITY latest: ${last(n.balance)?.de?.toFixed(2) ?? "—"}`;
}

export async function verdict(c: CompanySnapshot, guidance: QuarterGuidance[], n = numbers(c)) {
  const said = [...guidance]
    .reverse()
    .map((g) => `## ${g.period} call (tone: ${g.tone})\n${g.statements.map((s) => `- [${s.topic}, ${s.horizon}] ${s.target} — "${s.quote}"`).join("\n")}\nAnalysts pressed on: ${g.analyst_pushback.join("; ") || "—"}`)
    .join("\n\n");
  const raw = await structured({
    tier: "deep",
    task: "verdict-v6",
    commit: true,
    schema: VerdictSchema,
    maxTokens: 8000,
    system:
      "You are a skeptical buy-side analyst. Judge management's credibility by comparing what they guided on earnings calls " +
      "with what the reported numbers later showed. Rules: use ONLY the guidance and numbers provided — no outside knowledge, " +
      "news or assumptions about the company. Cite periods and figures. Note: a call held in month M discusses the quarter that " +
      "ended just before it (e.g. an 'Oct 2026' call discusses the Sep 2026 quarter). If the delivery period has not been " +
      "reported yet, use 'too_early'. If the promise cannot be checked from company-level financials at all (e.g. unit " +
      "volumes, segment splits not provided), use 'unverifiable'. Indian fiscal years end in March (FY26 = Apr 2025–Mar 2026). " +
      "Choose 4-7 promises, PRIORITISING ones you can actually check against the numbers given (revenue growth, margins, " +
      "profit, capex via investing cash flow / fixed-asset growth, debt); include at most 2 unverifiable ones. " +
      "Verdict direction: meeting OR EXCEEDING a growth/margin/profit target is 'delivered' (beating conservative guidance " +
      "is good delivery — say so in credibility_line); 'missed' means the outcome fell short of what was promised. For a " +
      "cautious statement (e.g. 'expect a decline'), a better-than-guided outcome is 'delivered'. For capex, spending within " +
      "~15% of the guided amount is 'delivered'. " +
      "Judge a promise ONLY against periods that END AFTER the call in which it was made; a multi-year target whose " +
      "window has not finished is 'too_early' (you may note progress so far). A segment-level target (e.g. one business " +
      "line's margin) compared with consolidated numbers is 'unverifiable'. In 'delivered', quote the actual figure and period. credibility_line: one sentence on the pattern (e.g. 'Guides " +
      "conservatively and beats on revenue, but margin promises keep slipping'). Every string under 30 words. " +
      "Refer to quarters by the labels given (e.g. 'Sep 2026 quarter'), never as Q1/Q2/Q3. 2-4 narrative checks, 3 bull, 3 bear.",
    user: `Company: ${c.name} (${c.symbol})\n\nWHAT MANAGEMENT SAID (oldest first):\n${said}\n\nWHAT THE NUMBERS SHOW:\n${numbersBrief(c, n)}`,
  });
  return score(enforceTime(raw, c.quarters.periods.at(-1) ?? ""));
}
