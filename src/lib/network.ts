import { NETWORK } from "@/data/network";
import { ORG_SYMBOL } from "@/data/portfolio";
import type { Edge, Lead, Person, Stint } from "./types";

// The Network engine is deliberately deterministic: every suggestion carries the evidence that
// produced it ("worked together at Bharat Forge 2010–14"), so the investor can trust and verify it.
// No model is needed to decide who to call; a model would only add hallucination risk here.

const NOW_YEAR = new Date().getFullYear();
const TIER_WEIGHT = { close: 1.2, warm: 1.0, acquaintance: 0.8 } as const;

const allPeople = () => [...NETWORK.contacts, ...NETWORK.extended];
export const personById = (id: string) => allPeople().find((p) => p.id === id) ?? null;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const span = (s: Pick<Stint, "from" | "to">) => `${s.from}–${s.to ? String(s.to).slice(2) : "now"}`;

/** Industry string from Screener → expertise themes used in the network. */
const THEMES: [RegExp, string[]][] = [
  [/software|it services|computers/i, ["it services"]],
  [/bank/i, ["banks"]],
  [/non banking|nbfc|finance company|vehicle/i, ["nbfc", "rural lending"]],
  [/housing finance/i, ["affordable housing", "rural lending"]],
  [/specialty chemical|speciality chemical|fluoro|chemicals/i, ["specialty chemicals", "fluorochemicals"]],
  [/pesticide|agro/i, ["agrochemicals"]],
  [/pharma|drug/i, ["pharma", "pharma regulatory"]],
  [/electronic|\bems\b|semiconductor/i, ["ems", "electronics manufacturing", "semiconductors"]],
  [/cable|wire/i, ["cables & wires", "electricals"]],
  [/paint/i, ["paints", "consumer brands"]],
  [/car|automobile|passenger|auto/i, ["autos", "auto components"]],
  [/jewel|gems/i, ["jewellery", "consumer retail"]],
  [/retail/i, ["consumer retail", "value retail", "apparel"]],
  [/refiner|oil|petro|telecom/i, ["energy", "petrochemicals", "telecom"]],
  [/construction|engineering|capital goods/i, ["epc", "capital goods"]],
  [/electrical equipment|heavy electrical/i, ["power equipment", "capital goods"]],
  [/depositor|exchange|capital market/i, ["capital markets infra"]],
];

export function themesFor(industry: string | null, sector: string | null): string[] {
  const text = `${industry ?? ""} ${sector ?? ""}`;
  const out = new Set<string>();
  for (const [re, tags] of THEMES) if (re.test(text)) tags.forEach((t) => out.add(t));
  return [...out];
}

function stintAt(p: Person, symbol: string) {
  return p.career.filter((s) => s.symbol === symbol);
}

function yearsAgo(s: Stint) {
  return s.to === null ? 0 : NOW_YEAR - s.to;
}

// ---------- Who should I call about company X? ----------

export interface CompanyRef {
  symbol: string;
  name: string;
  peers?: { symbol: string; name: string }[];
  industry?: string | null;
  sector?: string | null;
}

export function leadsForCompany(c: CompanyRef, opts: { theme?: string; limit?: number } = {}): Lead[] {
  const peerSyms = new Set((c.peers ?? []).map((p) => p.symbol));
  const themes = new Set([...themesFor(c.industry ?? null, c.sector ?? null), ...(opts.theme ? [opts.theme] : [])]);
  const shortName = c.name.replace(/\s*\((India)\)|\s+(Ltd|Limited)\.?$/gi, "").replace(/\s+(Ltd|Limited)\.?$/i, "");
  const leads: Lead[] = [];

  for (const p of NETWORK.contacts) {
    let score = 0;
    const reasons: string[] = [];
    let ask = "";
    for (const s of stintAt(p, c.symbol)) {
      if (s.to === null) {
        score += 1.0;
        reasons.push(`Works at ${shortName} now — ${s.role}`);
        ask = `Ask how this is landing internally and what the street is missing.`;
      } else {
        score += Math.max(0.4, 0.85 - 0.05 * yearsAgo(s));
        reasons.push(`Was ${s.role} at ${shortName} (${span(s)})`);
        ask ||= `Ask about culture, how decisions get made, and who is still there from their time.`;
      }
    }
    for (const s of p.career.filter((s) => s.symbol && peerSyms.has(s.symbol))) {
      score += s.to === null ? 0.5 : 0.35;
      reasons.push(s.to === null ? `${s.role} at competitor ${s.org}` : `Was ${s.role} at competitor ${s.org} (${span(s)})`);
      ask ||= `Ask how ${s.org} sees ${shortName} competitively — pricing, share, talent.`;
    }
    const exp = p.expertise.filter((e) => themes.has(e));
    if (exp.length) {
      score += Math.min(0.45, 0.2 * exp.length);
      reasons.push(`Go-to on ${exp.join(", ")}`);
      ask ||= `Ask for a read on the ${exp[0]} cycle and where ${shortName} sits in it.`;
    }
    if (score > 0 && p.relationship) {
      score *= TIER_WEIGHT[p.relationship.tier];
      leads.push({ person: p, degree: 1, score, reasons, ask });
    }
  }

  // Second degree: people at the company we can reach through a contact.
  for (const x of NETWORK.extended) {
    const at = stintAt(x, c.symbol).find((s) => s.to === null);
    if (!at) continue;
    const path = bestPathTo(x);
    if (!path) continue;
    leads.push({
      person: x,
      degree: 2,
      via: path,
      score: 0.9 * path.edge.strength,
      reasons: [`${at.role} at ${shortName}`, `Reach via ${path.person.name}: ${path.edge.how}`],
      ask: `Ask ${path.person.name.split(" ")[0]} for a warm intro.`,
    });
  }
  return leads.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 5);
}

// ---------- Who do I know who knows person Y? ----------

export function bestPathTo(target: Person): { person: Person; edge: Edge } | null {
  const paths = pathsTo(target);
  return paths[0] ?? null;
}

export function pathsTo(target: Person): { person: Person; edge: Edge }[] {
  const out: { person: Person; edge: Edge }[] = [];
  for (const e of NETWORK.edges) {
    const other = e.a === target.id ? e.b : e.b === target.id ? e.a : null;
    if (!other) continue;
    const p = NETWORK.contacts.find((c) => c.id === other);
    if (p) out.push({ person: p, edge: e });
  }
  // Rank by link strength × how well *I* know the intermediary.
  return out.sort(
    (a, b) =>
      b.edge.strength * TIER_WEIGHT[b.person.relationship?.tier ?? "acquaintance"] -
      a.edge.strength * TIER_WEIGHT[a.person.relationship?.tier ?? "acquaintance"],
  );
}

export interface Overlap {
  person: Person; // my contact
  kind: "worked-with" | "studied-with" | "knows" | "same-company-different-time";
  detail: string;
  strength: number;
}

/** Inferred overlaps between a person (e.g. an incoming CFO) and my contacts — even with no explicit edge. */
export function overlapsWith(target: Person): Overlap[] {
  const out: Overlap[] = [];
  for (const c of NETWORK.contacts) {
    if (c.id === target.id) continue;
    for (const ts of target.career) {
      for (const cs of c.career) {
        if (!ts.symbol || ts.symbol !== cs.symbol) continue;
        const from = Math.max(ts.from, cs.from);
        const to = Math.min(ts.to ?? NOW_YEAR, cs.to ?? NOW_YEAR);
        if (to - from >= 0) {
          out.push({ person: c, kind: "worked-with", detail: `Both at ${ts.org}, ${from}–${String(to).slice(2)}`, strength: Math.min(1, 0.4 + 0.12 * (to - from)) });
        } else {
          out.push({ person: c, kind: "same-company-different-time", detail: `Also ex-${ts.org} (${span(cs)}) — shared alumni network`, strength: 0.25 });
        }
      }
    }
    for (const te of target.education) {
      for (const ce of c.education) {
        if (norm(te.school) === norm(ce.school) && Math.abs(te.year - ce.year) <= 2 && te.school !== "ICAI") {
          out.push({ person: c, kind: "studied-with", detail: `${te.school}${te.year === ce.year ? `, same batch (${te.year})` : `, ${ce.year} vs ${te.year}`}`, strength: te.year === ce.year ? 0.55 : 0.35 });
        }
      }
    }
  }
  for (const path of pathsTo(target)) {
    out.push({ person: path.person, kind: "knows", detail: path.edge.how, strength: path.edge.strength });
  }
  // Collapse to one line per contact, strongest first, merging details.
  const byId = new Map<string, Overlap>();
  for (const o of out.sort((a, b) => b.strength - a.strength)) {
    const prev = byId.get(o.person.id);
    if (!prev) byId.set(o.person.id, { ...o });
    else if (!prev.detail.includes(o.detail)) prev.detail += ` · ${o.detail}`;
  }
  return [...byId.values()].filter((o) => o.kind !== "same-company-different-time" || o.strength > 0.2).slice(0, 4);
}

/** Your own overlap with a person (same school / past employer). */
export function myOverlap(target: Person): string[] {
  const out: string[] = [];
  for (const e of target.education) if (NETWORK.me.education.some((s) => norm(s) === norm(e.school))) out.push(`You're both ${e.school} alumni`);
  for (const s of target.career) if (NETWORK.me.pastEmployers.some((o) => norm(o) === norm(s.org))) out.push(`You both worked at ${s.org}`);
  return out;
}

// ---------- Name resolution (filings → people) ----------

export function findPersonByName(name: string): Person | null {
  const n = norm(name).replace(/^(mr|ms|mrs|dr|shri|smt) /, "");
  if (!n) return null;
  const toks = new Set(n.split(" "));
  let best: { p: Person; s: number } | null = null;
  for (const p of allPeople()) {
    const pt = norm(p.name).split(" ");
    const hit = pt.filter((t) => toks.has(t)).length / Math.max(pt.length, toks.size);
    if (hit > (best?.s ?? 0)) best = { p, s: hit };
  }
  return best && best.s >= 0.99 ? best.p : null; // full-name match only — never guess identity
}

// ---------- Expertise map & reconnect ----------

export function expertiseMap() {
  const map = new Map<string, Person[]>();
  for (const p of NETWORK.contacts) for (const e of p.expertise) map.set(e, [...(map.get(e) ?? []), p]);
  return [...map.entries()]
    .map(([theme, people]) => ({
      theme,
      people: people.sort((a, b) => TIER_WEIGHT[b.relationship!.tier] - TIER_WEIGHT[a.relationship!.tier]),
    }))
    .sort((a, b) => b.people.length - a.people.length);
}

export function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Contacts gone quiet whose current/former employer just did something — a natural reason to call. */
export function reconnectNudges(events: { symbol: string; headline: string; category: string }[], minDays = 90) {
  const out: { person: Person; stint: Stint; event: (typeof events)[number]; days: number }[] = [];
  for (const p of NETWORK.contacts) {
    const days = daysSince(p.relationship!.lastSpoke);
    if (days < minDays) continue;
    for (const s of p.career) {
      const ev = events.find((e) => e.symbol === s.symbol);
      if (ev) {
        out.push({ person: p, stint: s, event: ev, days });
        break;
      }
    }
  }
  return out.sort((a, b) => b.days - a.days);
}

export const symbolForOrg = (org: string) => ORG_SYMBOL[org];
