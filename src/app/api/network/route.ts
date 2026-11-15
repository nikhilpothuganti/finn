import { NETWORK } from "@/data/network";
import { daysSince, expertiseMap } from "@/lib/network";

export async function GET() {
  return Response.json({
    me: NETWORK.me,
    contacts: NETWORK.contacts.map((p) => ({ ...p, quietDays: daysSince(p.relationship!.lastSpoke) })),
    extendedCount: NETWORK.extended.length,
    expertise: expertiseMap().map((t) => ({ theme: t.theme, people: t.people.map((p) => ({ id: p.id, name: p.name, tier: p.relationship!.tier, headline: p.headline })) })),
  });
}
