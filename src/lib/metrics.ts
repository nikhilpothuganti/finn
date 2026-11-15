import type { CompanySnapshot, Table } from "./types";

// Pure arithmetic over Screener tables. No model touches numbers.

const ALIASES = {
  revenue: ["Sales", "Revenue"],
  ebitda: ["Operating Profit", "Financing Profit"],
  pbt: ["Profit before tax"],
  pat: ["Net Profit"],
} as const;
export type Headline = keyof typeof ALIASES;

export function row(t: Table, key: Headline | string): (number | null)[] {
  const names = (ALIASES as Record<string, readonly string[]>)[key] ?? [key];
  for (const n of names) if (t.rows[n]) return t.rows[n];
  return [];
}

export const isLender = (c: Pick<CompanySnapshot, "quarters">) => Boolean(c.quarters.rows["Financing Profit"]);

export const pct = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100;

export interface ResultsCut {
  period: string;
  prevPeriod: string;
  yoyPeriod: string;
  lines: { key: Headline; label: string; value: number | null; qoq: number | null; yoy: number | null }[];
  margin: { label: string; now: number | null; yoyBps: number | null };
}

/** Latest quarter vs previous quarter (QoQ) and same quarter last year (YoY). */
export function resultsCut(c: CompanySnapshot): ResultsCut | null {
  const q = c.quarters;
  const n = q.periods.length;
  if (n < 5) return null;
  const i = n - 1;
  const lender = isLender(c);
  const label: Record<Headline, string> = {
    revenue: lender ? "Revenue (interest earned)" : "Revenue",
    ebitda: lender ? "Op. profit" : "EBITDA",
    pbt: "PBT",
    pat: "PAT",
  };
  const lines = (Object.keys(ALIASES) as Headline[]).map((k) => {
    const r = row(q, k);
    return { key: k, label: label[k], value: r[i] ?? null, qoq: pct(r[i], r[i - 1]), yoy: pct(r[i], r[i - 4]) };
  });
  const rev = row(q, "revenue");
  const pat = row(q, "pat");
  const m = (j: number) => (rev[j] && pat[j] != null ? (pat[j]! / rev[j]!) * 100 : null);
  const now = m(i);
  const then = m(i - 4);
  return {
    period: q.periods[i],
    prevPeriod: q.periods[i - 1],
    yoyPeriod: q.periods[i - 4],
    lines,
    margin: { label: "PAT margin", now, yoyBps: now != null && then != null ? Math.round((now - then) * 100) : null },
  };
}

export interface PriceSignal {
  symbol: string;
  date: string;
  close: number;
  changePct: number;
  volume: number;
  volMultiple: number; // today's volume ÷ 20-day average
  high52: boolean;
  low52: boolean;
}

export function priceSignal(c: CompanySnapshot): PriceSignal | null {
  const p = c.prices;
  if (p.length < 22) return null;
  const last = p[p.length - 1];
  const prev = p[p.length - 2];
  const window = p.slice(-21, -1);
  const avgVol = window.reduce((s, x) => s + x.volume, 0) / window.length;
  const year = p.slice(-250);
  return {
    symbol: c.symbol,
    date: last.date,
    close: last.close,
    changePct: pct(last.close, prev.close) ?? 0,
    volume: last.volume,
    volMultiple: avgVol ? last.volume / avgVol : 0,
    high52: last.close >= Math.max(...year.map((x) => x.close)),
    low52: last.close <= Math.min(...year.map((x) => x.close)),
  };
}

export const fmtCr = (v: number | null) =>
  v == null ? "—" : `₹${Math.abs(v) >= 1000 ? v.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : v.toFixed(0)} cr`;
export const fmtPct = (v: number | null, digits = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`);
