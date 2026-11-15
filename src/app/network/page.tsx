"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { Person } from "@/lib/types";
import { Avatar, Card, Chip, Section, Skeleton, SyntheticBadge } from "@/components/ui";

interface NetData {
  me: { education: string[]; pastEmployers: string[] };
  contacts: (Person & { quietDays: number })[];
  extendedCount: number;
  expertise: { theme: string; people: { id: string; name: string; tier: string; headline: string }[] }[];
}

export default function NetworkPage() {
  const [d, setD] = useState<NetData | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/network").then((r) => r.json()).then(setD);
  }, []);

  const list = useMemo(() => {
    if (!d) return [];
    const t = q.toLowerCase();
    return d.contacts
      .filter((p) => !theme || p.expertise.includes(theme))
      .filter((p) => !t || [p.name, p.headline, ...p.career.map((s) => s.org), ...p.expertise, ...p.education.map((e) => e.school)].join(" ").toLowerCase().includes(t))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [d, theme, q]);

  if (!d)
    return (
      <div className="pt-2">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="mt-4 h-40" />
      </div>
    );

  const tiers = { close: d.contacts.filter((c) => c.relationship?.tier === "close").length, warm: d.contacts.filter((c) => c.relationship?.tier === "warm").length };
  const quiet = d.contacts.filter((c) => c.quietDays > 180).length;
  const orgs = new Set(d.contacts.flatMap((c) => c.career.map((s) => s.org))).size;

  return (
    <div>
      <h1 className="pt-2 font-serif text-[30px] leading-tight tracking-tight">Your network</h1>
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-2">
        {d.contacts.length} people · {orgs} companies · {d.extendedCount} reachable in one hop <SyntheticBadge />
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat v={tiers.close} l="close" />
        <Stat v={tiers.warm} l="warm" />
        <Stat v={quiet} l="gone quiet 6m+" tone={quiet ? "watch" : undefined} />
      </div>

      <Section title="Expertise map" aside={<span className="text-[11px] text-ink-3">tap a theme</span>}>
        <div className="flex flex-wrap gap-1.5">
          {d.expertise.map((t) => (
            <button
              key={t.theme}
              onClick={() => setTheme(theme === t.theme ? null : t.theme)}
              className={clsx("rounded-full border px-2.5 py-1 text-[12.5px]", theme === t.theme ? "border-net bg-net text-white" : "border-line bg-surface text-ink-2")}
            >
              {t.theme} <span className="opacity-60">{t.people.length}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title={theme ? `Go-to on ${theme}` : "Everyone"}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, school…" className="mb-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-[14px] outline-none focus:border-ink" />
        <Card className="!py-1 divide-y divide-line">
          {list.map((p) => (
            <Link key={p.id} href={`/p/${p.id}`} className="flex items-center gap-3 py-2.5">
              <Avatar name={p.name} size={34} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">{p.name}</p>
                <p className="truncate text-[12px] text-ink-3">{p.headline}</p>
              </div>
              <div className="text-right">
                <Chip tone={p.relationship?.tier === "close" ? "net" : "plain"}>{p.relationship?.tier}</Chip>
                {p.quietDays > 180 && <p className="mt-0.5 text-[10.5px] text-watch">{Math.round(p.quietDays / 30)}m quiet</p>}
              </div>
            </Link>
          ))}
        </Card>
      </Section>

      <Card className="mt-6 !bg-transparent border-dashed text-[12px] leading-relaxed text-ink-3">
        <p className="font-semibold text-ink-2">What FINN starts from</p>
        Your schools ({d.me.education.join(", ")}), past employers ({d.me.pastEmployers.join(", ")}), and contacts you choose to import. Each person is enriched from their public professional profile; second-degree links come only from what your contacts share. Nothing here is visible to anyone but you.
      </Card>
    </div>
  );
}

function Stat({ v, l, tone }: { v: number; l: string; tone?: "watch" }) {
  return (
    <div className="rounded-xl border border-line bg-surface py-2.5">
      <p className={clsx("num text-[20px] font-semibold", tone === "watch" && "text-watch")}>{v}</p>
      <p className="text-[11px] text-ink-3">{l}</p>
    </div>
  );
}
