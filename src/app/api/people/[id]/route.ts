import { NextRequest } from "next/server";
import { daysSince, myOverlap, overlapsWith, pathsTo, personById } from "@/lib/network";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = personById(id);
  if (!p) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ person: p, overlaps: overlapsWith(p), paths: pathsTo(p), mine: myOverlap(p), quietDays: p.relationship ? daysSince(p.relationship.lastSpoke) : null });
}
