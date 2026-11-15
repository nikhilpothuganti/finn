import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

// Two-tier cache.
//  1. data/cache/   – committed to git, written by `npm run ingest`. Read-only at runtime.
//                     Guarantees the demo works even when an upstream source is down.
//  2. RUNTIME_DIR   – writable scratch (/tmp on serverless) for live fetches + LLM results.
// Every LLM output is keyed by a hash of (model, prompt, input) so identical work is never paid twice.

const COMMITTED = path.join(process.cwd(), "data", "cache");
const RUNTIME = process.env.VERCEL ? "/tmp/finn-cache" : path.join(process.cwd(), ".cache");
const memo = new Map<string, { at: number; value: unknown }>();

export const hash = (...parts: unknown[]) =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);

const file = (dir: string, ns: string, key: string) => path.join(dir, ns, `${key}.json`);

async function readJson<T>(p: string): Promise<{ at: number; value: T } | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return null;
  }
}

export async function cacheGet<T>(ns: string, key: string, maxAgeMs = Infinity): Promise<T | null> {
  const id = `${ns}/${key}`;
  const m = memo.get(id);
  if (m && Date.now() - m.at < maxAgeMs) return m.value as T;
  for (const dir of [RUNTIME, COMMITTED]) {
    const hit = await readJson<T>(file(dir, ns, key));
    if (hit && Date.now() - hit.at < maxAgeMs) {
      memo.set(id, hit);
      return hit.value;
    }
  }
  return null;
}

/** Stale read: return whatever we have regardless of age (used as an upstream-failure fallback). */
export const cacheGetStale = <T>(ns: string, key: string) => cacheGet<T>(ns, key, Infinity);

export async function cacheSet<T>(ns: string, key: string, value: T, opts: { commit?: boolean } = {}) {
  const entry = { at: Date.now(), value };
  memo.set(`${ns}/${key}`, entry);
  const p = file(opts.commit ? COMMITTED : RUNTIME, ns, key);
  try {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(entry));
  } catch {
    // read-only FS: the in-memory memo still serves this instance
  }
}

/** Memoise an async computation under ns/key. Falls back to a stale value if the computation throws. */
export async function cached<T>(
  ns: string,
  key: string,
  maxAgeMs: number,
  compute: () => Promise<T>,
  opts: { commit?: boolean } = {},
): Promise<T> {
  const fresh = await cacheGet<T>(ns, key, maxAgeMs);
  if (fresh !== null) return fresh;
  try {
    const value = await compute();
    await cacheSet(ns, key, value, opts);
    return value;
  } catch (err) {
    const stale = await cacheGetStale<T>(ns, key);
    if (stale !== null) return stale;
    throw err;
  }
}

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
