import { extractText, getDocumentProxy } from "unpdf";
import { cached, DAY } from "../cache";

// Primary documents (concall transcripts, annual reports) → text → guidance-bearing passages.
// The retrieval step is plain keyword scoring, no embeddings and no model: it shrinks a ~25K-token
// transcript to the ~3K tokens that actually contain forward-looking statements, which is what
// makes the analysis fit inside a free-tier token budget.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

export async function pdfText(url: string): Promise<string> {
  return cached("pdftext", Buffer.from(url).toString("base64url").slice(-80), 365 * DAY, async () => {
    let res: Response | null = null;
    for (let i = 0; i < 3 && !res?.ok; i++) {
      res = await fetch(url, { headers: { "User-Agent": UA } }).catch(() => null);
      if (!res?.ok) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
    if (!res) throw new Error("document fetch failed");
    if (!res.ok) throw new Error(`document ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    return text.replace(/\s+/g, " ").trim();
  });
}

const FORWARD = [
  /\bguid(e|ance|ing)\b/i, /\boutlook\b/i, /\bexpect(s|ed|ing)?\b/i, /\btarget(s|ing)?\b/i, /\baspir/i,
  /\bgoing forward\b/i, /\bnext (year|quarter|two|three|few)\b/i, /\bFY\s?'?\d{2}/i, /\bdouble[- ]digit\b/i,
  /\bmargin(s)? (band|range|of|at|in)\b/i, /\bcapex\b/i, /\bwe will\b/i, /\bwe should\b/i, /\bvisibility\b/i,
  /\bpipeline\b/i, /\border (book|inflow)\b/i, /\bramp[- ]up\b/i, /\bcommission/i, /\bby the end of\b/i,
];
const NUMERIC = /\d+(\.\d+)?\s?(%|percent|bps|basis points|crore|cr\b|billion|bn\b|million|mn\b)/i;
const NOISE = /safe harbor|forward-looking statements (are|involve)|ladies and gentlemen|thank you|moderator|please press|question queue|joining us/i;

export function guidancePassages(text: string, budgetChars = 11000): string {
  // Sentence windows of ~3 sentences with a little overlap.
  const sents = text.split(/(?<=[.?!])\s+(?=[A-Z])/).filter((s) => s.length > 30);
  const windows: { i: number; t: string; score: number }[] = [];
  for (let i = 0; i < sents.length; i += 2) {
    const t = sents.slice(i, i + 3).join(" ");
    if (NOISE.test(t)) continue;
    let score = FORWARD.reduce((s, re) => s + (re.test(t) ? 1 : 0), 0);
    if (NUMERIC.test(t)) score += 1.5;
    if (score >= 2) windows.push({ i, t, score });
  }
  const chosen: typeof windows = [];
  let used = 0;
  for (const w of [...windows].sort((a, b) => b.score - a.score)) {
    if (used + w.t.length > budgetChars) continue;
    chosen.push(w);
    used += w.t.length;
  }
  // Back in document order so the model reads them as they were said.
  return chosen.sort((a, b) => a.i - b.i).map((w) => `• ${w.t}`).join("\n");
}
