import { NextRequest } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";
import { hasLLM } from "@/lib/llm";
import { numbers, quarterGuidance, verdict, type QuarterGuidance, type Verdict } from "@/lib/research";
import { getCompany } from "@/lib/sources/screener";

// Streams NDJSON: {type:"progress"} lines while reading transcripts, then {type:"result"}.
export const maxDuration = 300;

export async function GET(req: NextRequest, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  const sym = symbol.toUpperCase();
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const cachedResult = fresh ? null : await cacheGet<{ guidance: QuarterGuidance[]; verdict: Verdict; at: string }>("analysis", sym);
        if (cachedResult) {
          send({ type: "result", ...cachedResult, cached: true });
          return ctrl.close();
        }
        if (!hasLLM()) {
          send({ type: "error", message: "Transcript analysis needs an LLM key (GROQ_API_KEY). The numbers above are computed without one." });
          return ctrl.close();
        }
        const c = await getCompany(sym);
        const guidance = await quarterGuidance(c, 4, (m) => send({ type: "progress", message: m }));
        if (!guidance.length) {
          send({ type: "error", message: "No readable concall transcripts found for this company." });
          return ctrl.close();
        }
        send({ type: "progress", message: `Comparing ${guidance.length} quarters of guidance with reported numbers` });
        const v = await verdict(c, guidance, numbers(c));
        const result = { guidance, verdict: v, at: new Date().toISOString() };
        await cacheSet("analysis", sym, result, { commit: process.env.FINN_COMMIT === "1" });
        send({ type: "result", ...result, cached: false });
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      }
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
