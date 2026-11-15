import { NextRequest } from "next/server";
import { buildDigest, DEFAULT_SETTINGS, type Settings } from "@/lib/digest";
import type { Category } from "@/lib/types";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const num = (k: string, d: number) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
  const settings: Settings = {
    windowHours: Math.min(24 * 30, Math.max(1, num("window", DEFAULT_SETTINGS.windowHours))),
    priceMovePct: num("price", DEFAULT_SETTINGS.priceMovePct),
    volMultiple: num("vol", DEFAULT_SETTINGS.volMultiple),
    alertCategories: q.get("cats") ? (q.get("cats")!.split(",") as Category[]) : DEFAULT_SETTINGS.alertCategories,
    scenarios: q.get("scenarios") !== "0",
  };
  return Response.json(await buildDigest(settings));
}
