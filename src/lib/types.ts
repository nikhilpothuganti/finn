// Shared domain types. Kept deliberately small: every layer (push, pull, network)
// speaks in Companies, Filings, Signals and People.

export type Category =
  | "results"
  | "M&A"
  | "fund_raise"
  | "management_change"
  | "litigation"
  | "insider_trading"
  | "earnings_call"
  | "investor_meetings"
  | "credit_rating"
  | "dividend"
  | "bonus_split"
  | "capex"
  | "press_release"
  | "postal_ballot"
  | "agm_egm"
  | "pledging"
  | "unclassified";

/** A financial table from Screener: one row per line item, one column per period. */
export interface Table {
  periods: string[]; // e.g. ["Sep 2025", "Dec 2025", ...] oldest -> newest
  rows: Record<string, (number | null)[]>; // normalised label -> values aligned to periods
}

export interface Filing {
  id: string; // stable hash of url
  symbol: string;
  title: string;
  summary: string | null; // exchange/aggregator one-liner, when present
  url: string;
  at: string; // ISO timestamp
}

export interface ConcallDoc {
  period: string; // "Oct 2026"
  transcriptUrl: string | null;
  pptUrl: string | null;
}

export interface CompanySnapshot {
  symbol: string;
  name: string;
  screenerId: string;
  fetchedAt: string;
  about: string;
  keyPoints: string;
  sector: string | null;
  industry: string | null;
  peers: { symbol: string; name: string }[];
  ratios: Record<string, string>; // "Market Cap" -> "₹ 8,71,055 Cr."
  quarters: Table;
  annual: Table; // profit & loss
  balance: Table;
  cashflow: Table;
  efficiency: Table; // debtor days, CCC, ROCE ...
  filings: Filing[];
  concalls: ConcallDoc[];
  annualReports: { year: string; url: string }[];
  prices: { date: string; close: number; volume: number }[];
}

// ---------- Network ----------

export interface Stint {
  org: string; // company name as the person would write it
  symbol?: string; // NSE symbol when the org is listed
  role: string;
  from: number; // year
  to: number | null; // null = present
}

export interface Person {
  id: string;
  name: string;
  headline: string;
  city: string;
  career: Stint[];
  education: { school: string; degree: string; year: number }[];
  expertise: string[]; // theme tags, lower-case
  /** Only for first-degree contacts. */
  relationship?: {
    tier: "close" | "warm" | "acquaintance";
    context: string; // "IIM-A batchmate", "met at Ambit conference 2024"
    lastSpoke: string; // ISO date
  };
  source: "synthetic"; // provenance is always explicit
}

export interface Edge {
  a: string;
  b: string;
  strength: number; // 0..1
  how: string; // "worked together at Infosys 2012-16"
}

export interface Network {
  me: { name: string; education: string[]; pastEmployers: string[] };
  contacts: Person[]; // first degree
  extended: Person[]; // second degree / public profiles referenced in filings
  edges: Edge[]; // contact <-> extended links
}

export interface Lead {
  person: Person;
  degree: 1 | 2;
  via?: { person: Person; edge: Edge };
  score: number;
  reasons: string[]; // human-readable, most important first
  ask: string; // what to ask them
}
