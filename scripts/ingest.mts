// Daily pipeline: refresh company snapshots (filings, fundamentals, EOD prices) for the portfolio
// and research set into data/cache/ (committed). Run: npm run ingest [-- --research]
import { PORTFOLIO, RESEARCH_SET } from "../src/data/portfolio";
import { getCompany } from "../src/lib/sources/screener";

const symbols = [...PORTFOLIO, ...RESEARCH_SET];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
for (const s of symbols) {
  try {
    const c = await getCompany(s, { commit: true, maxAgeMs: 0 });
    ok++;
    console.log(`✓ ${s.padEnd(11)} ${c.name.slice(0, 32).padEnd(32)} filings=${c.filings.length} q=${c.quarters.periods.length} prices=${c.prices.length} peers=${c.peers.length} concalls=${c.concalls.length}`);
  } catch (e) {
    console.log(`✗ ${s}: ${(e as Error).message}`);
  }
  await sleep(1200); // be polite to the upstream
}
console.log(`${ok}/${symbols.length} companies refreshed`);
