// Re-apply code-enforced verdict rules + scoring to stored analyses (no model calls).
import { cacheGet, cacheSet } from "../src/lib/cache";
import { enforceTime, score, type QuarterGuidance, type Verdict } from "../src/lib/research";
import type { CompanySnapshot } from "../src/lib/types";
import { readdirSync } from "node:fs";

for (const f of readdirSync("data/cache/analysis")) {
  const sym = f.replace(/\.json$/, "");
  const a = await cacheGet<{ guidance: QuarterGuidance[]; verdict: Verdict; at: string }>("analysis", sym);
  const c = await cacheGet<CompanySnapshot>("company", sym);
  if (!a || !c) continue;
  const v = score(enforceTime(a.verdict, c.quarters.periods.at(-1) ?? ""));
  await cacheSet("analysis", sym, { ...a, verdict: v }, { commit: true });
  console.log(sym.padEnd(11), `${a.verdict.credibility} → ${v.credibility}`, `checked ${v.checked}`);
}
