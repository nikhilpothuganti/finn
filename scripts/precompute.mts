// Precompute LLM work for the demo set so reviewers never wait or spend tokens:
//   - promised-vs-delivered analysis for every research-set company and a few holdings
//   - results first-cut from the actual filing for every results announcement in the last 30 days
// Results are written to data/cache (committed). Requires GROQ_API_KEY.
//   npm run precompute [-- SYMBOL ...]
import { PORTFOLIO, RESEARCH_SET } from "../src/data/portfolio";
import { cacheGet, cacheSet } from "../src/lib/cache";
import { buildDigest, DEFAULT_SETTINGS } from "../src/lib/digest";
import { hasLLM } from "../src/lib/llm";
import { numbers, quarterGuidance, verdict } from "../src/lib/research";
import { getCompany } from "../src/lib/sources/screener";

if (!hasLLM()) {
  console.error("Set GROQ_API_KEY first (e.g. in .env.local, then: node --env-file=.env.local ...)");
  process.exit(1);
}
// --force re-scores companies that already have an analysis (transcript extractions stay cached, so it's cheap).
const force = process.argv.includes("--force");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const targets = args.length ? args : [...RESEARCH_SET, "DIXON", "PIIND", "SUNPHARMA", "AAVAS", "POLYCAB", "KAYNES"];

for (const s of targets) {
  if (!args.length && !force && (await cacheGet("analysis", s))) {
    console.log(`= ${s} already analysed`);
    continue;
  }
  const t0 = Date.now();
  try {
    const c = await getCompany(s);
    const g = await quarterGuidance(c, 4, (m) => console.log(`  ${s}: ${m}`));
    if (!g.length) throw new Error("no transcripts");
    const v = await verdict(c, g, numbers(c));
    await cacheSet("analysis", s, { guidance: g, verdict: v, at: new Date().toISOString() }, { commit: true });
    console.log(`✓ ${s} credibility ${v.credibility}/10 — ${v.credibility_line} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } catch (e) {
    console.log(`✗ ${s}: ${(e as Error).message}`);
  }
  // Free tier is ~8K tokens/min per model: let the window reset between companies.
  if (s !== targets.at(-1)) await new Promise((r) => setTimeout(r, Number(process.env.FINN_PAUSE_MS ?? 60_000)));
}

if (!args.length) {
  // Warm the 30-day digest: results extraction from filings + name extraction get cached + committed.
  const d = await buildDigest({ ...DEFAULT_SETTINGS, windowHours: 720 }, { live: true });
  for (const i of d.items.filter((x) => x.results)) console.log(`results ${i.symbol}: source=${i.results!.source} ${i.results!.period}`);
}
console.log("done", PORTFOLIO.length);
