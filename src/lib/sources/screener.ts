import * as cheerio from "cheerio";
import { cached, hash, HOUR } from "../cache";
import type { CompanySnapshot, ConcallDoc, Filing, Table } from "../types";

// screener.in is the single upstream for filings, fundamentals and EOD prices:
//  - company page:  announcements (BSE/NSE links + one-line summary), quarterly + annual
//                   financials, balance sheet, cash flow, concall transcript + AR links
//  - chart API:     daily close + volume
//  - peers API:     listed competitors (feeds the Network's "who knows a competitor")
// Everything is fetched politely (one page per company) and cached.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const BASE = "https://www.screener.in";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string, accept = "text/html", attempt = 0): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, cache: "no-store" });
  if (res.status === 429 && attempt < 3) {
    await sleep(1500 * 2 ** attempt); // polite exponential backoff
    return get(url, accept, attempt + 1);
  }
  if (!res.ok) throw new Error(`screener ${res.status} for ${url}`);
  return res.text();
}

const num = (s: string): number | null => {
  const t = s.replace(/[,%\s₹]|&nbsp;/g, "").trim();
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/\+$/, "").trim();

function parseTable($: cheerio.CheerioAPI, sectionId: string): Table {
  const sec = $(`section#${sectionId}`).first();
  const table = sec.find("table.data-table").first();
  const periods = table
    .find("thead th")
    .slice(1)
    .map((_, th) => clean($(th).text()))
    .get();
  const rows: Table["rows"] = {};
  table.find("tbody tr").each((_, tr) => {
    const cells = $(tr).find("td");
    // first cell holds the label (sometimes wrapped in a button with a trailing "+")
    const label = clean($(cells[0]).clone().children("span,div.tooltip").remove().end().text()).replace(/\s*\+$/, "");
    if (!label || $(cells[1]).find("a").length) return; // skip "Raw PDF" link rows
    rows[label] = cells
      .slice(1)
      .map((_, td) => num($(td).text()))
      .get();
  });
  return { periods, rows };
}

function parseFilings($: cheerio.CheerioAPI, symbol: string): Filing[] {
  const out: Filing[] = [];
  $("#company-announcements-tab ul.list-links li a").each((_, a) => {
    const el = $(a);
    const url = el.attr("href") ?? "";
    const meta = el.find("div").first();
    const at = meta.find("time").attr("datetime") ?? "";
    const summary = clean(meta.text().replace(meta.find("time").text(), "")).replace(/^-\s*/, "") || null;
    const title = clean(el.clone().children("div").remove().end().text());
    if (url && at) out.push({ id: hash(url), symbol, title, summary, url, at: new Date(at).toISOString() });
  });
  return out;
}

function parseConcalls($: cheerio.CheerioAPI): ConcallDoc[] {
  const out: ConcallDoc[] = [];
  $(".documents.concalls ul.list-links > li")
    .each((_, li) => {
      const row = $(li);
      const period = clean(row.children("div").first().text());
      const transcriptUrl = row.find("a[title='Raw Transcript']").attr("href") ?? null;
      const pptUrl = row.find("a.button-chip:contains('PPT')").attr("href") ?? null;
      if (period) out.push({ period, transcriptUrl, pptUrl });
    });
  return out;
}

async function fetchPrices(screenerId: string, days = 400) {
  const json = JSON.parse(
    await get(`${BASE}/api/company/${screenerId}/chart/?q=Price-Volume&days=${days}`, "application/json"),
  ) as { datasets: { metric: string; values: [string, string | number, ...unknown[]][] }[] };
  const price = json.datasets.find((d) => d.metric === "Price")?.values ?? [];
  const vol = new Map((json.datasets.find((d) => d.metric === "Volume")?.values ?? []).map((v) => [v[0], Number(v[1])]));
  return price.map(([date, close]) => ({ date, close: Number(close), volume: vol.get(date) ?? 0 }));
}

async function fetchPeers(warehouseId: string) {
  try {
    const $ = cheerio.load(await get(`${BASE}/api/company/${warehouseId}/peers/`));
    return $("a[href^='/company/']")
      .map((_, a) => ({
        symbol: ($(a).attr("href") ?? "").split("/")[2],
        name: clean($(a).text()),
      }))
      .get()
      .filter((p) => p.symbol);
  } catch {
    return [];
  }
}

export async function fetchCompany(symbolRaw: string): Promise<CompanySnapshot> {
  const symbol = symbolRaw.toUpperCase().replace(/\.(NS|BO)$/, "");
  let html: string;
  try {
    html = await get(`${BASE}/company/${encodeURIComponent(symbol)}/consolidated/`);
  } catch {
    html = await get(`${BASE}/company/${encodeURIComponent(symbol)}/`);
  }
  const $ = cheerio.load(html);
  // Consolidated numbers can be missing or stale (a company that stopped consolidating keeps an old
  // consolidated table). Use standalone when it is more recent.
  const lastQ = (doc: cheerio.CheerioAPI) =>
    new Date(doc("section#quarters table.data-table thead th").last().attr("data-date-key") ?? "1970-01-01").getTime();
  const staleMs = 200 * 86_400_000;
  if ($("section#quarters table.data-table tbody tr").length === 0 || Date.now() - lastQ($) > staleMs) {
    const standalone = await get(`${BASE}/company/${encodeURIComponent(symbol)}/`).catch(() => null);
    if (standalone) {
      const $s = cheerio.load(standalone);
      if (lastQ($s) > lastQ($)) return build($s, symbol);
    }
  }
  return build($, symbol);
}

async function build($: cheerio.CheerioAPI, symbol: string): Promise<CompanySnapshot> {
  const screenerId = $("[data-company-id]").first().attr("data-company-id") ?? "";
  const warehouseId = $("[data-warehouse-id]").first().attr("data-warehouse-id") ?? "";
  if (!screenerId) throw new Error(`Unknown ticker ${symbol}`);

  const ratios: Record<string, string> = {};
  $("#top-ratios li").each((_, li) => {
    ratios[clean($(li).find(".name").text())] = clean($(li).find(".value").text());
  });
  const crumbs = $("section#peers p.sub a")
    .map((_, a) => ({ t: $(a).attr("title"), v: clean($(a).text()) }))
    .get();

  // Sequential on purpose: Screener rate-limits bursts.
  const prices = await fetchPrices(screenerId).catch(() => []);
  const peers = warehouseId ? await fetchPeers(warehouseId) : [];

  const annualReports = $(".documents.annual-reports ul.list-links li > a")
    .map((_, a) => ({ year: clean($(a).text()).replace(/^Annual Report\s*/, ""), url: $(a).attr("href") ?? "" }))
    .get()
    .filter((r) => r.url);

  return {
    symbol,
    name: clean($("h1").first().text()),
    screenerId,
    fetchedAt: new Date().toISOString(),
    about: clean($(".company-profile .about").text()).replace(/\[\d+\]/g, ""),
    keyPoints: $(".company-profile .commentary").text().replace(/\[\d+\]/g, "").replace(/\n{2,}/g, "\n").trim(),
    sector: crumbs.find((c) => c.t === "Sector")?.v ?? null,
    industry: crumbs.find((c) => c.t === "Industry")?.v ?? crumbs.find((c) => c.t === "Broad Industry")?.v ?? null,
    peers: peers.filter((p) => p.symbol !== symbol).slice(0, 8),
    ratios,
    quarters: parseTable($, "quarters"),
    annual: parseTable($, "profit-loss"),
    balance: parseTable($, "balance-sheet"),
    cashflow: parseTable($, "cash-flow"),
    efficiency: parseTable($, "ratios"),
    filings: parseFilings($, symbol),
    concalls: parseConcalls($),
    annualReports,
    prices,
  };
}

/** Cached company snapshot. Fresh for 6h; on upstream failure serves the last good copy. */
export function getCompany(symbol: string, opts: { commit?: boolean; maxAgeMs?: number } = {}) {
  const s = symbol.toUpperCase();
  return cached("company", s, opts.maxAgeMs ?? 6 * HOUR, () => fetchCompany(s), { commit: opts.commit });
}
