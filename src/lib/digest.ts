import { z } from "zod";
import { PORTFOLIO } from "@/data/portfolio";
import { scenarioFilings } from "@/data/scenarios";
import { cacheGetStale } from "./cache";
import { CATEGORY_LABEL, classifyAll, priorityOf, type Priority } from "./classify";
import { hasLLM, structured } from "./llm";
import { fmtPct, priceSignal, type PriceSignal } from "./metrics";
import { resultsForFiling, type ResultsView } from "./results";
import {
  findPersonByName, leadsForCompany, myOverlap, overlapsWith, reconnectNudges, type Overlap,
} from "./network";
import { getCompany } from "./sources/screener";
import type { Category, CompanySnapshot, Filing, Lead, Person } from "./types";

export interface Settings {
  windowHours: number;
  priceMovePct: number;
  volMultiple: number;
  alertCategories: Category[];
  scenarios: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  windowHours: 24,
  priceMovePct: 4,
  volMultiple: 2,
  alertCategories: ["results", "M&A", "management_change", "litigation", "pledging", "fund_raise", "capex"],
  scenarios: true,
};

export interface PersonCard {
  name: string;
  role: string | null;
  profile: Person | null;
  overlaps: Overlap[];
  mine: string[];
}

export interface DigestItem {
  id: string;
  symbol: string;
  company: string;
  at: string;
  category: Category;
  label: string;
  priority: Priority;
  alert: boolean;
  title: string;
  summary: string | null;
  url: string;
  scenario: boolean;
  why: string | null;
  results?: ResultsView;
  person?: PersonCard;
  leads?: Lead[];
}

export interface MarketAlert {
  symbol: string;
  company: string;
  date: string;
  reasons: string[];
  signal: PriceSignal;
  leads: Lead[];
}

/** Portfolio snapshots: committed/cached copy first (instant), live fetch only if missing. */
export async function loadPortfolio(): Promise<CompanySnapshot[]> {
  const out: CompanySnapshot[] = [];
  for (const s of PORTFOLIO) {
    const snap = (await cacheGetStale<CompanySnapshot>("company", s)) ?? (await getCompany(s).catch(() => null));
    if (snap) out.push(snap);
  }
  return out;
}

const NAME_RE = /\b(?:Mr|Ms|Mrs|Dr|Shri|Smt)\.?\s+([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){1,3})/;
const ROLE_RE = /(Chief [A-Z][a-z]+ Officer|CFO|CEO|COO|Managing Director(?: & CEO)?|MD & CEO|Whole[- ]time Director|Independent Director|Company Secretary|Chairman)/i;

const NameSchema = z.object({ people: z.array(z.object({ name: z.string(), role: z.string(), joining: z.boolean() })) });

async function personFromFiling(f: Filing & { person?: string }, live: boolean): Promise<PersonCard | undefined> {
  const text = `${f.title}. ${f.summary ?? ""}`;
  let name = f.person ?? text.match(NAME_RE)?.[1]?.trim() ?? null;
  let role = text.match(ROLE_RE)?.[1] ?? null;
  if (!name && hasLLM()) {
    // Cheap model, tiny input: only for top-priority management filings whose title has no "Mr./Ms." name.
    const res = await structured({
      tier: "fast",
      task: "mgmt-name-v1",
      cacheOnly: !live,
      commit: true,
      schema: NameSchema,
      system: "Extract the people named in an Indian exchange filing about a management change. joining=true if the person is being appointed. Return an empty list if no person is named.",
      user: text,
    }).catch(() => null);
    const joiner = res?.people.find((p) => p.joining) ?? res?.people[0];
    if (joiner) ({ name, role } = { name: joiner.name, role: joiner.role || role });
  }
  if (!name) return undefined;
  const profile = findPersonByName(name);
  return {
    name,
    role,
    profile,
    overlaps: profile ? overlapsWith(profile) : [],
    mine: profile ? myOverlap(profile) : [],
  };
}

function whyFor(cat: Category, c: CompanySnapshot, r?: ResultsView, p?: PersonCard): string | null {
  if (cat === "results" && r) {
    if (r.note) return r.note;
    const rev = r.lines.find((l) => l.key === "revenue")!;
    const pat = r.lines.find((l) => l.key === "pat")!;
    return `${r.period}: revenue ${fmtPct(rev.yoy, 0)} YoY, PAT ${fmtPct(pat.yoy, 0)} YoY${
      r.margin.yoyBps != null ? `; margin ${r.margin.yoyBps >= 0 ? "+" : ""}${r.margin.yoyBps} bps` : ""
    }.`;
  }
  if (cat === "management_change" && p) {
    const prev = p.profile?.career.filter((s) => s.symbol !== c.symbol).at(-1);
    const link = p.overlaps[0];
    return [
      prev ? `Comes from ${prev.org} (${prev.role}).` : null,
      link ? `${link.person.name} ${link.kind === "worked-with" ? "worked with" : link.kind === "studied-with" ? "studied with" : "knows"} ${p.name.split(" ")[0]}.` : null,
    ].filter(Boolean).join(" ") || null;
  }
  return null;
}

/** live=false (request path): read cached model outputs only, never block on a model. */
export async function buildDigest(settings: Settings, opts: { live?: boolean } = {}) {
  const live = Boolean(opts.live);
  const companies = await loadPortfolio();
  const bySym = new Map(companies.map((c) => [c.symbol, c]));
  const since = Date.now() - settings.windowHours * 3_600_000;

  const liveFilings = companies.flatMap((c) => c.filings).filter((f) => new Date(f.at).getTime() >= since);
  const scen = settings.scenarios ? scenarioFilings().filter((f) => new Date(f.at).getTime() >= since) : [];
  const cats = await classifyAll(liveFilings, { live });

  const items: DigestItem[] = [];
  const resultsSeen = new Set<string>();
  // The filing that carries the numbers ("Financial Results ...") should represent a results event.
  const ordered = [...scen, ...liveFilings].sort((a, b) => Number(/financial results/i.test(b.title)) - Number(/financial results/i.test(a.title)));
  for (const f of ordered) {
    const c = bySym.get(f.symbol);
    if (!c) continue;
    const category = "category" in f ? (f.category as Category) : cats.get(f.id) ?? "unclassified";
    let priority = priorityOf(category, f);
    // One results event per company: the board outcome, the PDF and the press release collapse into one card.
    if (category === "results" && priority === 1) {
      if (resultsSeen.has(f.symbol)) priority = 3;
      resultsSeen.add(f.symbol);
    }
    const item: DigestItem = {
      id: f.id,
      symbol: f.symbol,
      company: c.name,
      at: f.at,
      category,
      label: CATEGORY_LABEL[category],
      priority,
      alert: priority === 1 && settings.alertCategories.includes(category),
      title: f.title,
      summary: f.summary,
      url: f.url,
      scenario: "scenario" in f,
      why: null,
    };
    // Enrich only what earns it: tier-1 items get the full treatment, the rest stay one line.
    if (category === "results" && priority === 1) item.results = (await resultsForFiling(c, f, { live })) ?? undefined;
    if (category === "management_change" && priority === 1) item.person = await personFromFiling(f, live);
    if (priority === 1 && ["M&A", "capex", "litigation", "fund_raise", "management_change", "pledging"].includes(category)) {
      item.leads = leadsForCompany(c, { limit: 3 });
    }
    item.why = whyFor(category, c, item.results, item.person);
    items.push(item);
  }
  items.sort((a, b) => a.priority - b.priority || +new Date(b.at) - +new Date(a.at));

  // Market alerts: user-defined thresholds on end-of-day data.
  const alerts: MarketAlert[] = [];
  for (const c of companies) {
    const s = priceSignal(c);
    if (!s) continue;
    const reasons: string[] = [];
    if (Math.abs(s.changePct) >= settings.priceMovePct) reasons.push(`${fmtPct(s.changePct)} on the day`);
    if (s.volMultiple >= settings.volMultiple) reasons.push(`${s.volMultiple.toFixed(1)}× 20-day avg volume`);
    if (s.high52) reasons.push("52-week high");
    if (s.low52) reasons.push("52-week low");
    if (reasons.length) alerts.push({ symbol: c.symbol, company: c.name, date: s.date, reasons, signal: s, leads: leadsForCompany(c, { limit: 2 }) });
  }
  alerts.sort((a, b) => b.reasons.length - a.reasons.length || Math.abs(b.signal.changePct) - Math.abs(a.signal.changePct));

  const nudges = reconnectNudges(
    items.filter((i) => i.priority <= 2).map((i) => ({ symbol: i.symbol, headline: i.title, category: i.label })),
  ).slice(0, 4);

  // Pulse: whole-book move for the header.
  const moves = companies.map((c) => ({ symbol: c.symbol, name: c.name, s: priceSignal(c) })).filter((m) => m.s);
  const lastDate = moves.map((m) => m.s!.date).sort().at(-1) ?? null;

  return {
    generatedAt: new Date().toISOString(),
    settings,
    lastPriceDate: lastDate,
    dataAsOf: companies.map((c) => c.fetchedAt).sort()[0] ?? null,
    counts: {
      companies: companies.length,
      filings: items.length,
      act: items.filter((i) => i.priority === 1).length,
      routine: items.filter((i) => i.priority === 3).length,
    },
    items,
    alerts,
    nudges: nudges.map((n) => ({ person: n.person, org: n.stint.org, current: n.stint.to === null, event: n.event, days: n.days })),
    moves: moves.map((m) => ({ symbol: m.symbol, name: m.name, changePct: m.s!.changePct })).sort((a, b) => b.changePct - a.changePct),
  };
}

export type Digest = Awaited<ReturnType<typeof buildDigest>>;
