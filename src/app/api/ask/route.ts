import { NextRequest } from "next/server";
import { NETWORK } from "@/data/network";
import { ORG_SYMBOL, PORTFOLIO, RESEARCH_SET } from "@/data/portfolio";
import { cacheGetStale } from "@/lib/cache";
import { expertiseMap, leadsForCompany, pathsTo } from "@/lib/network";
import { getCompany } from "@/lib/sources/screener";
import type { CompanySnapshot } from "@/lib/types";

// "Ask FINN" — a deterministic intent router. Most investor questions are one of four shapes
// (a company, a person, a theme, "who do I know at X"), so we resolve them with string matching
// over the investor's own universe: instant, free, and it can't invent a company or a person.

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9&. ]/g, " ").replace(/\s+/g, " ").trim();

async function universe() {
  const out: { symbol: string; names: string[] }[] = [];
  for (const s of [...PORTFOLIO, ...RESEARCH_SET]) {
    const c = await cacheGetStale<CompanySnapshot>("company", s);
    const short = c?.name.replace(/\b(ltd|limited|india|\(india\)|industries|technologies|company|international)\b\.?/gi, "").trim();
    out.push({ symbol: s, names: [s, c?.name ?? s, short ?? s].map(norm) });
  }
  for (const [org, sym] of Object.entries(ORG_SYMBOL)) out.push({ symbol: sym, names: [norm(org)] });
  return out;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("q") ?? "";
  const q = ` ${norm(raw)} `;
  if (!q.trim()) return Response.json({ kind: "none" });
  const wantsPeople = /\b(who|call|know|knows|intro|introduce|talk|speak|contact|people|expert)\b/.test(q);

  // 1. A person in the network
  for (const p of [...NETWORK.contacts, ...NETWORK.extended]) {
    const [first, ...rest] = norm(p.name).split(" ");
    if (q.includes(` ${norm(p.name)} `) || (rest.length && q.includes(` ${first} `) && q.includes(` ${rest.at(-1)} `)))
      return Response.json({ kind: "person", id: p.id });
  }

  // 2. A company (longest name match wins)
  let best: { symbol: string; len: number } | null = null;
  for (const u of await universe())
    for (const n of u.names) if (n.length > 1 && q.includes(` ${n} `) && n.length > (best?.len ?? 0)) best = { symbol: u.symbol, len: n.length };

  // 3. A theme in the expertise map
  const themes = expertiseMap();
  const theme = themes.find((t) => q.includes(` ${t.theme} `)) ?? themes.find((t) => t.theme.split(" ").every((w) => q.includes(` ${w.replace(/s$/, "")}`)));

  if (best && wantsPeople) {
    const c = (await cacheGetStale<CompanySnapshot>("company", best.symbol)) ?? (await getCompany(best.symbol).catch(() => null));
    const leads = c ? leadsForCompany(c, { limit: 6 }) : [];
    return Response.json({ kind: "company-people", symbol: best.symbol, name: c?.name ?? best.symbol, leads, paths: leads.filter((l) => l.degree === 2).map((l) => ({ id: l.person.id, paths: pathsTo(l.person) })) });
  }
  if (best) return Response.json({ kind: "company", symbol: best.symbol });
  if (theme) return Response.json({ kind: "theme", theme: theme.theme, people: theme.people });

  // 4. Looks like a ticker we don't hold — let the research page try it live.
  const tok = raw.trim().toUpperCase();
  if (/^[A-Z0-9&-]{2,15}$/.test(tok)) return Response.json({ kind: "company", symbol: tok });
  return Response.json({ kind: "none", themes: themes.slice(0, 8).map((t) => t.theme) });
}
