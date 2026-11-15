"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, GraduationCap, Handshake, Link2 } from "lucide-react";
import { DraftSheet, PathLine } from "@/components/Leads";
import { Avatar, Card, Chip, Section, Skeleton, SyntheticBadge } from "@/components/ui";
import type { Overlap } from "@/lib/network";
import type { Edge, Person } from "@/lib/types";

interface Data {
  person: Person;
  overlaps: Overlap[];
  paths: { person: Person; edge: Edge }[];
  mine: string[];
  quietDays: number | null;
}

const ICON = { "worked-with": Handshake, "studied-with": GraduationCap, knows: Link2, "same-company-different-time": Link2 } as const;

export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Data | null>(null);
  const [draft, setDraft] = useState<{ person: Person; target?: Person } | null>(null);

  useEffect(() => {
    fetch(`/api/people/${id}`).then((r) => r.json()).then(setD);
  }, [id]);

  if (!d)
    return (
      <div className="pt-2">
        <Skeleton className="h-16" />
        <Skeleton className="mt-4 h-48" />
      </div>
    );

  const p = d.person;
  const contact = Boolean(p.relationship);
  const days = d.quietDays;
  const current = p.career.find((s) => s.to === null);

  return (
    <div className="pt-2">
      <Link href="/network" className="inline-flex items-center gap-1 text-[13px] text-ink-3">
        <ArrowLeft size={15} /> Network
      </Link>
      <header className="mt-4 flex items-center gap-3">
        <Avatar name={p.name} size={56} tone={contact ? "net" : "plain"} />
        <div className="min-w-0">
          <h1 className="font-serif text-[26px] leading-tight">{p.name}</h1>
          <p className="text-[13px] text-ink-2">{p.headline}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3">
            {p.city} · {contact ? <Chip tone="net">{p.relationship!.tier} · 1°</Chip> : <Chip>2° — you don&apos;t know them yet</Chip>} <SyntheticBadge />
          </p>
        </div>
      </header>

      {contact && (
        <Card className="mt-4">
          <p className="text-[13px] text-ink-2">{p.relationship!.context}</p>
          <p className="mt-0.5 text-[12px] text-ink-3">
            Last spoke {days! < 45 ? `${days} days ago` : `${Math.round(days! / 30)} months ago`}
            {days! > 180 && <span className="text-watch"> — overdue</span>}
          </p>
          <button onClick={() => setDraft({ person: p })} className="mt-3 w-full rounded-xl bg-ink py-2.5 text-[13.5px] font-medium text-bg">
            Draft a note to {p.name.split(" ")[0]}
          </button>
        </Card>
      )}

      {!contact && d.paths.length > 0 && (
        <Section title="Your way in">
          <Card className="space-y-3">
            {d.paths.map((path) => (
              <div key={path.person.id}>
                <PathLine from={path.person} how={path.edge.how} to={p} />
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded bg-surface-2">
                    <div className="h-full rounded bg-net" style={{ width: `${path.edge.strength * 100}%` }} />
                  </div>
                  <button onClick={() => setDraft({ person: path.person, target: p })} className="text-[12px] font-medium text-net">
                    Ask for intro
                  </button>
                </div>
              </div>
            ))}
          </Card>
        </Section>
      )}

      {(d.overlaps.length > 0 || d.mine.length > 0) && (
        <Section title={contact ? "Shared history with your other contacts" : "Overlaps with your network"}>
          <Card className="space-y-2">
            {d.mine.map((m) => (
              <p key={m} className="text-[13px] font-medium">
                {m}
              </p>
            ))}
            {d.overlaps.map((o) => {
              const I = ICON[o.kind];
              return (
                <Link key={o.person.id} href={`/p/${o.person.id}`} className="flex items-start gap-2 text-[13px] leading-snug">
                  <I size={14} className="mt-[2px] shrink-0 text-net" />
                  <span>
                    <span className="font-semibold">{o.person.name}</span> <span className="text-ink-2">— {o.detail}</span>
                  </span>
                </Link>
              );
            })}
          </Card>
        </Section>
      )}

      <Section title="Career">
        <Card>
          <ol className="relative space-y-3 border-l border-line pl-4">
            {[...p.career].reverse().map((s) => (
              <li key={s.org + s.from} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-ink-3" />
                <p className="text-[14px] font-semibold">
                  {s.symbol ? (
                    <Link href={`/c/${s.symbol}`} className="underline decoration-line underline-offset-2">
                      {s.org}
                    </Link>
                  ) : (
                    s.org
                  )}
                </p>
                <p className="text-[12.5px] text-ink-2">
                  {s.role} · <span className="num">{s.from}–{s.to ?? "now"}</span>
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-4 border-t border-line pt-3 text-[12.5px] text-ink-2">
            {p.education.map((e) => (
              <p key={e.school}>
                {e.school} · {e.degree} <span className="num text-ink-3">{e.year}</span>
              </p>
            ))}
          </div>
        </Card>
      </Section>

      <Section title="Ask them about">
        <div className="flex flex-wrap gap-1.5">
          {p.expertise.map((e) => (
            <Chip key={e}>{e}</Chip>
          ))}
          {current?.symbol && (
            <Link href={`/c/${current.symbol}`}>
              <Chip tone="net">Research {current.symbol} →</Chip>
            </Link>
          )}
        </div>
      </Section>

      {draft && <DraftSheet person={draft.person} target={draft.target} context={draft.target ? `I'd love to meet ${draft.target.name}` : "Was thinking of you"} onClose={() => setDraft(null)} />}
    </div>
  );
}
