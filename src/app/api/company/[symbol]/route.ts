import { NextRequest } from "next/server";
import { leadsForCompany } from "@/lib/network";
import { numbers } from "@/lib/research";
import { getCompany } from "@/lib/sources/screener";
import { classifyAll, CATEGORY_LABEL, priorityOf } from "@/lib/classify";
import { cacheGet } from "@/lib/cache";

export const maxDuration = 60;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  try {
    const c = await getCompany(symbol);
    const cats = await classifyAll(c.filings);
    const n = numbers(c);
    // If a verdict was already computed (precompute or earlier visit), ship it with the page.
    const hasAnalysis = Boolean(await cacheGet("analysis", c.symbol));
    return Response.json({
      company: {
        symbol: c.symbol, name: c.name, about: c.about, keyPoints: c.keyPoints, sector: c.sector, industry: c.industry,
        peers: c.peers, fetchedAt: c.fetchedAt, annualReports: c.annualReports.slice(0, 3),
        concalls: c.concalls.filter((x) => x.transcriptUrl).slice(0, 6),
        prices: c.prices.slice(-250).map((p) => [p.date, p.close]),
      },
      filings: c.filings.map((f) => {
        const cat = cats.get(f.id) ?? "unclassified";
        return { ...f, category: cat, label: CATEGORY_LABEL[cat], priority: priorityOf(cat, f) };
      }),
      numbers: n,
      leads: leadsForCompany(c, { limit: 6 }),
      hasAnalysis,
    });
  } catch (e) {
    return Response.json({ error: `Couldn't load ${symbol.toUpperCase()}: ${(e as Error).message}` }, { status: 404 });
  }
}
