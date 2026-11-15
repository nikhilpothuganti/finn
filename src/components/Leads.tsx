"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Copy, MessageCircle, X } from "lucide-react";
import type { Lead, Person } from "@/lib/types";
import { Avatar, Chip, SyntheticBadge } from "./ui";

// "Who to call" — the Network surfacing inside a Push or Pull moment.
// Every row shows WHY this person (evidence), not just WHO, and one tap drafts the outreach.

export function LeadRow({ lead, context }: { lead: Lead; context: string }) {
  const [open, setOpen] = useState(false);
  const p = lead.person;
  const via = lead.via?.person;
  return (
    <>
      <div className="flex items-start gap-3 py-2.5">
        <Link href={`/p/${p.id}`} className="shrink-0">
          <Avatar name={p.name} size={34} tone={lead.degree === 1 ? "net" : "plain"} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link href={`/p/${p.id}`} className="truncate text-[14px] font-semibold">
              {p.name}
            </Link>
            <Chip tone={lead.degree === 1 ? "net" : "plain"} className="!px-1.5 !py-0 !text-[10px]">
              {lead.degree === 1 ? "1°" : "2°"}
            </Chip>
          </div>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{lead.reasons[0]}</p>
          {lead.reasons.slice(1, 2).map((r) => (
            <p key={r} className="text-[12px] leading-snug text-ink-3">
              {r}
            </p>
          ))}
        </div>
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[12px] font-medium text-net active:scale-95"
        >
          {via ? "Intro" : "Reach out"}
        </button>
      </div>
      {open && <DraftSheet person={via ?? p} target={via ? p : undefined} context={context} onClose={() => setOpen(false)} />}
    </>
  );
}

export function LeadList({ leads, context, max = 3 }: { leads: Lead[]; context: string; max?: number }) {
  if (!leads?.length) return null;
  return (
    <div className="divide-y divide-line">
      {leads.slice(0, max).map((l) => (
        <LeadRow key={l.person.id} lead={l} context={context} />
      ))}
    </div>
  );
}

function draftFor(person: Person, context: string, target?: Person) {
  const first = person.name.split(" ")[0];
  const warm = person.relationship?.tier === "close" ? "Hope all's well!" : "Hope you've been well — it's been a while.";
  if (target)
    return `Hi ${first}, ${warm} Quick one: ${context}. I believe you know ${target.name} well — would you be comfortable making an intro? Happy to send a short blurb you can forward. Thanks!`;
  return `Hi ${first}, ${warm} ${context} — and you're the person I trust most to put it in context. Could we grab 15 minutes this week? Coffee's on me.`;
}

export function DraftSheet({ person, target, context, onClose }: { person: Person; target?: Person; context: string; onClose: () => void }) {
  const [text, setText] = useState(() => draftFor(person, context, target));
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={onClose}>
      <div className="rise mx-auto w-full max-w-[480px] rounded-t-3xl bg-surface p-5 pb-[max(env(safe-area-inset-bottom),20px)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar name={person.name} size={28} />
            <div>
              <p className="text-[14px] font-semibold">{target ? `Ask ${person.name} for an intro` : `Note to ${person.name}`}</p>
              {person.relationship && <p className="text-[11.5px] text-ink-3">{person.relationship.context}</p>}
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-ink-3">
            <X size={18} />
          </button>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="w-full resize-none rounded-xl border border-line bg-bg p-3 text-[14px] leading-relaxed outline-none" />
        <div className="mt-3 flex gap-2">
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(text).catch(() => {});
              setCopied(true);
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-[13px] font-medium"
          >
            <Copy size={15} /> {copied ? "Copied" : "Copy"}
          </button>
          <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink py-2.5 text-[13px] font-medium text-bg">
            <MessageCircle size={15} /> WhatsApp
          </a>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-3">
          <SyntheticBadge /> FINN drafts; you send. Nothing leaves your device until you do.
        </p>
      </div>
    </div>
  );
}

export function PathLine({ from, how, to }: { from: Person; how: string; to: Person }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px]">
      <span className="font-medium">You</span>
      <ArrowRight size={12} className="text-ink-3" />
      <Link href={`/p/${from.id}`} className="font-medium text-net">
        {from.name}
      </Link>
      <ArrowRight size={12} className="text-ink-3" />
      <span className="font-medium">{to.name}</span>
      <span className="truncate text-ink-3">· {how}</span>
    </div>
  );
}
