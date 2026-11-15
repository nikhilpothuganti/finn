import { z } from "zod";
import { hasLLM, structured } from "./llm";
import type { Category, Filing } from "./types";

// Two-stage classifier.
//  1. Rules on the exchange title + one-line summary. Exchange titles are formulaic
//     ("Announcement under Regulation 30 (LODR)-Analyst / Investor Meet - Intimation"),
//     so rules resolve ~85% of filings for free, instantly and deterministically.
//  2. Only filings the rules can't place go to Haiku, batched, cached by filing id.

const RULES: [Category, RegExp][] = [
  ["press_release", /results (issued|declared|announced) by|financial results (of|issued by) (the )?(parent|holding|promoter|[A-Z][a-z]+ (Motor|Corporation))/i],
  ["unclassified", /appointment of (statutory |secretarial |internal |cost )?auditor|trading window|regulation 74\(5\)/i],
  ["pledging", /\bpledg|encumbr/i],
  ["insider_trading", /insider trading|regulation 7\(2\)|\bsast\b|takeover reg|acquisition of shares by promoter|disclosure.*promoter.*(buy|sell|acqui)/i],
  ["management_change", /change in (directorate|management|key managerial|kmp|senior management)|appoint|resign|cessation|re-?designat|chief (executive|financial|operating)|\b(ceo|cfo|coo|cto|md)\b.*(join|exit|step)|managing director|whole[- ]time director|retire/i],
  ["earnings_call", /earnings call|conference call|con-?call|transcript|audio recording|analyst call|investor call/i],
  ["results", /financial results|\bresults\b|outcome of board meeting.*(result|financial)|integrated filing.*financ/i],
  ["M&A", /acqui|merger|amalgamat|demerger|joint venture|\bjv\b|scheme of arrangement|stake (sale|purchase)|divest|wholly[- ]owned subsidiary.*(incorporat|invest)|investment in subsidiary/i],
  ["fund_raise", /\bqip\b|rights issue|preferential (issue|allot)|fund ?rais|non-convertible|\bncd\b|commercial paper|buy-?back|issue of (equity|securities|debentures)/i],
  ["litigation", /litigat|lawsuit|show cause|penalt|\bfine\b|order (passed|received)|tribunal|\bnclt\b|insolvenc|search and seizure|tax demand|regulatory action|warning letter|\busfda\b.*(observ|483|warning)|form 483|import alert/i],
  ["credit_rating", /credit rating|rating (agency|action|update)|\b(crisil|icra|care|india ratings|brickwork)\b/i],
  ["bonus_split", /\bbonus\b|sub-?division|stock split|split of/i],
  ["dividend", /dividend|record date/i],
  ["capex", /capex|capital expenditure|capacity expansion|new (plant|facility|unit)|greenfield|brownfield|commissioning|commercial production/i],
  ["investor_meetings", /analyst.*meet|investor.*meet|institutional investor|non-deal roadshow|investor conference/i],
  ["postal_ballot", /postal ballot|e-?voting/i],
  ["agm_egm", /\bagm\b|\begm\b|annual general meeting|extra-?ordinary general|shareholders meeting/i],
  ["press_release", /press release|order (win|received|book)|bags|secures|launch|partnership|clarification|media release/i],
  ["unclassified", /trading window|newspaper|regulation 74|certificate|loss of share|duplicate share|esop|esos|compliance|investor complaints|\bxbrl\b|\besg\b|brsr|auditor|scrutini[sz]er|intimation of record|updates?$/i],
];

export function classifyByRules(f: Pick<Filing, "title" | "summary">): Category | null {
  const text = `${f.title} ${f.summary ?? ""}`;
  // Title is authoritative; summary only breaks ties when the title is a generic "Regulation 30" wrapper.
  for (const [cat, re] of RULES) if (re.test(f.title)) return cat;
  for (const [cat, re] of RULES) if (re.test(text)) return cat;
  return null;
}

const CATS = [
  "results", "M&A", "fund_raise", "management_change", "litigation", "insider_trading", "earnings_call",
  "investor_meetings", "credit_rating", "dividend", "bonus_split", "capex", "press_release",
  "postal_ballot", "agm_egm", "pledging", "unclassified",
] as const satisfies readonly Category[];

const BatchSchema = z.object({
  items: z.array(z.object({ id: z.string(), category: z.enum(CATS) })),
});

export async function classifyAll(filings: Filing[], opts: { live?: boolean } = {}): Promise<Map<string, Category>> {
  const out = new Map<string, Category>();
  const unknown: Filing[] = [];
  for (const f of filings) {
    const c = classifyByRules(f);
    if (c) out.set(f.id, c);
    else unknown.push(f);
  }
  if (unknown.length && hasLLM()) {
    try {
      const res = await structured({
        tier: "fast",
        task: "classify-v1",
        cacheOnly: !opts.live,
        commit: true,
        schema: BatchSchema,
        system:
          "You label Indian stock-exchange corporate announcements into exactly one category. " +
          "Categories: " + CATS.join(", ") + ". Use 'unclassified' for routine compliance paperwork " +
          "that would not move the stock. Return one item per input id.",
        user: unknown.map((f) => `id=${f.id}\ntitle=${f.title}\nsummary=${f.summary ?? ""}`).join("\n\n"),
      });
      for (const it of res.items) out.set(it.id, it.category);
    } catch {
      /* fall through to default */
    }
  }
  for (const f of unknown) if (!out.has(f.id)) out.set(f.id, "press_release");
  return out;
}

// ---------- Priority policy ----------
// Tier 1 "Act": could change the thesis.  Tier 2 "Know": worth a glance.  Tier 3 "Routine": collapsed.

export type Priority = 1 | 2 | 3;

export const CATEGORY_LABEL: Record<Category, string> = {
  results: "Results",
  "M&A": "M&A",
  fund_raise: "Fund raise",
  management_change: "Management",
  litigation: "Litigation",
  insider_trading: "Insider trade",
  earnings_call: "Earnings call",
  investor_meetings: "Investor meet",
  credit_rating: "Credit rating",
  dividend: "Dividend",
  bonus_split: "Bonus / split",
  capex: "Capex",
  press_release: "Press release",
  postal_ballot: "Postal ballot",
  agm_egm: "AGM / EGM",
  pledging: "Pledge",
  unclassified: "Routine",
};

const BASE: Record<Category, Priority> = {
  results: 1, "M&A": 1, management_change: 1, litigation: 1, pledging: 1, fund_raise: 1, capex: 1,
  credit_rating: 2, insider_trading: 2, dividend: 2, bonus_split: 2, earnings_call: 2, press_release: 2,
  investor_meetings: 3, postal_ballot: 3, agm_egm: 3, unclassified: 3,
};

export function priorityOf(cat: Category, f: Pick<Filing, "title" | "summary">): Priority {
  const text = `${f.title} ${f.summary ?? ""}`;
  // Demote noise inside "important" categories, promote signal inside "minor" ones.
  if (cat === "results" && /newspaper|publication|intimation of board meeting|prior intimation/i.test(text)) return 2;
  if (cat === "management_change" && !/\b(ceo|cfo|coo|md|managing director|chief|chairman|whole[- ]time)\b/i.test(text)) return 2;
  if (cat === "fund_raise" && /repayment|redemption|payment of interest|intimation of (record|payment)/i.test(text)) return 3;
  if (cat === "credit_rating" && /downgrad|negative|watch/i.test(text)) return 1;
  if (cat === "press_release" && /order|contract|₹\s?[\d,]+\s?(cr|crore)|rs\.?\s?[\d,]+\s?(cr|crore)|bn|billion|approval|usfda/i.test(text)) return 1;
  if (cat === "earnings_call" && /transcript/i.test(text)) return 2;
  if (cat === "earnings_call") return 3;
  return BASE[cat];
}
