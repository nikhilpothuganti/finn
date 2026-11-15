import { z } from "zod";
import { cached, cacheGet, DAY, hash } from "./cache";

// LLM layer — Groq free tier (OpenAI-compatible chat completions + strict JSON-schema outputs).
//
// Model routing — the smallest model that does the job reliably:
//   fast → openai/gpt-oss-20b   : bulk extraction (guidance statements from transcript excerpts,
//                                 names from filings, classification fallback)
//   deep → openai/gpt-oss-120b  : the few judgement calls (promised-vs-delivered, bull/bear)
//   Qwen (qwen/qwen3.8-27b, preview) is the rate-limit fallback for both tiers.
//
// Cost discipline (free tier ≈ 8K tokens/min, 200K tokens/day per model):
//   - deterministic code does everything it can (rules, arithmetic, network scoring)
//   - transcripts are keyword-filtered to guidance-bearing passages BEFORE any model sees them
//   - every output is content-hash cached (and committed for the demo set), so a reviewer
//     opening the app triggers zero model calls for precomputed companies.

export const MODELS = {
  fast: ["openai/gpt-oss-20b", "qwen/qwen3.8-27b"],
  deep: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"],
} as const;
export type Tier = keyof typeof MODELS;

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export const hasLLM = () => Boolean(process.env.GROQ_API_KEY);

export class LLMUnavailable extends Error {
  constructor() {
    super("No LLM credentials configured (set GROQ_API_KEY)");
  }
}

/** Groq strict mode: every object needs additionalProperties:false and all keys required. */
function strictify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictify);
  if (!node || typeof node !== "object") return node;
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) if (k !== "$schema") o[k] = strictify(v);
  if (o.type === "object" && o.properties && typeof o.properties === "object") {
    o.additionalProperties = false;
    o.required = Object.keys(o.properties);
  }
  return o;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGroq(model: string, body: Record<string, unknown>) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, ...body }),
  });
  return res;
}

interface CallOpts<S extends z.ZodType> {
  tier: Tier;
  system: string;
  user: string;
  schema: S;
  /** Prompt-version id; bump it when the prompt changes to invalidate cached outputs. */
  task: string;
  maxTokens?: number;
  commit?: boolean;
  /** Serve only a cached result; never call the model (used on latency-critical request paths). */
  cacheOnly?: boolean;
}

export async function structured<S extends z.ZodType>(opts: CallOpts<S>): Promise<z.infer<S>> {
  const key = hash(opts.task, opts.tier, opts.system, opts.user);
  if (opts.cacheOnly) {
    const hit = await cacheGet<z.infer<S>>(`llm-${opts.task}`, key);
    if (hit === null) throw new LLMUnavailable();
    return hit;
  }
  return cached(
    `llm-${opts.task}`,
    key,
    90 * DAY,
    async () => {
      if (!hasLLM()) throw new LLMUnavailable();
      const schema = strictify(z.toJSONSchema(opts.schema));
      const body = {
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        max_completion_tokens: opts.maxTokens ?? (opts.tier === "deep" ? 6000 : 3000),
        reasoning_effort: opts.tier === "deep" ? "high" : "low",
        response_format: { type: "json_schema", json_schema: { name: opts.task.replace(/\W/g, "_"), strict: true, schema } },
      };

      let lastErr = "";
      // Walk the model list; on 429 try the next model, then back off and retry the list.
      for (let round = 0; round < 3; round++) {
        let waitMs = 0;
        for (const model of MODELS[opts.tier]) {
          let res: Response;
          try {
            res = await callGroq(model, body);
          } catch (e) {
            lastErr = `${model} network: ${(e as Error).message}`; // transient: try next model / next round
            waitMs = Math.max(waitMs, 3000);
            continue;
          }
          if (res.status === 429) {
            waitMs = Math.max(waitMs, Number(res.headers.get("retry-after") ?? 5) * 1000);
            lastErr = `${model} rate-limited`;
            continue;
          }
          if (!res.ok) {
            lastErr = `${model} ${res.status}: ${(await res.text()).slice(0, 300)}`;
            continue;
          }
          const json = (await res.json()) as { choices: { message: { content: string | null } }[] };
          const content = json.choices[0]?.message?.content ?? "";
          const parsed = opts.schema.safeParse(JSON.parse(content));
          if (parsed.success) return parsed.data as z.infer<S>;
          lastErr = `${model} returned off-schema JSON`;
        }
        if (waitMs) await sleep(Math.min(waitMs, 30_000));
      }
      throw new Error(`LLM call failed: ${lastErr}`);
    },
    { commit: opts.commit },
  );
}
