"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { LeadList } from "@/components/Leads";
import { Avatar, Card, Chip, Section } from "@/components/ui";
import type { Lead } from "@/lib/types";

const RESEARCH = ["PERSISTENT", "SRF", "CDSL", "KPITTECH", "CGPOWER"];
const BOOK = ["HDFCBANK", "TCS", "RELIANCE", "BAJFINANCE", "ASIANPAINT", "TITAN", "SUNPHARMA", "LT", "MARUTI", "DIXON", "KAYNES", "PIIND", "DEEPAKNTR", "NAVINFLUOR", "POLYCAB", "TRENT", "AAVAS", "CHOLAFIN"];
const EXAMPLES = ["Who should I call about Polycab?", "Who knows Vivek Chandra?", "rural lending", "semiconductors", "INFY"];

type Answer =
  | { kind: "theme"; theme: string; people: { id: string; name: string; headline: string; relationship?: { tier: string; context: string } }[] }
  | { kind: "company-people"; symbol: string; name: string; leads: Lead[] }
  | { kind: "none"; themes?: string[] };

export default function ResearchPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);

  async function ask(text: string) {
    if (!text.trim()) return;
    setQ(text);
    setBusy(true);
    setAnswer(null);
    const r = await fetch(`/api/ask?q=${encodeURIComponent(text)}`).then((r) => r.json());
    setBusy(false);
    if (r.kind === "company") return router.push(`/c/${r.symbol}`);
    if (r.kind === "person") return router.push(`/p/${r.id}`);
    setAnswer(r);
  }

  return (
    <div>
      <h1 className="pt-2 font-serif text-[30px] leading-tight tracking-tight">Ask FINN</h1>
      <p className="mt-1 text-[13.5px] text-ink-2">Any NSE ticker for a primary-source teardown. Or a person, a theme, or “who should I call about…”.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="mt-4 flex items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 py-3 focus-within:border-ink"
      >
        <Search size={18} className="text-ink-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. SRF, or who knows the new Dixon CFO?" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3" autoCapitalize="characters" />
        {busy ? <Loader2 size={18} className="animate-spin text-ink-3" /> : <button className="text-ink-2"><ArrowRight size={18} /></button>}
      </form>
      <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 no-scrollbar">
        {EXAMPLES.map((e) => (
          <button key={e} onClick={() => ask(e)} className="shrink-0 rounded-full border border-line px-3 py-1 text-[12px] text-ink-2">
            {e}
          </button>
        ))}
      </div>

      {answer?.kind === "theme" && (
        <Section title={`Your ${answer.theme} people`}>
          <Card className="!py-1 divide-y divide-line">
            {answer.people.map((p) => (
              <Link key={p.id} href={`/p/${p.id}`} className="flex items-center gap-3 py-2.5">
                <Avatar name={p.name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold">{p.name}</p>
                  <p className="truncate text-[12px] text-ink-3">{p.headline}</p>
                </div>
                {p.relationship && <Chip tone={p.relationship.tier === "close" ? "net" : "plain"}>{p.relationship.tier}</Chip>}
              </Link>
            ))}
          </Card>
        </Section>
      )}
      {answer?.kind === "company-people" && (
        <Section title={`Who can explain ${answer.name}`} aside={<Link href={`/c/${answer.symbol}`} className="text-[12px] text-net">Research →</Link>}>
          <Card className="!py-1">
            {answer.leads.length ? <LeadList leads={answer.leads} context={`I'm digging into ${answer.name}`} max={6} /> : <p className="py-3 text-[13px] text-ink-2">No one in your network has a direct line here yet.</p>}
          </Card>
        </Section>
      )}
      {answer?.kind === "none" && (
        <Card className="mt-5 text-[13px] text-ink-2">
          Couldn&apos;t place that. Try a ticker, a person in your network, or a theme like {answer.themes?.slice(0, 3).join(", ")}.
        </Card>
      )}

      <Section title="Research set">
        <div className="grid grid-cols-2 gap-2">
          {RESEARCH.map((s) => (
            <Link key={s} href={`/c/${s}`} className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2.5 text-[13.5px] font-semibold">
              {s} <ArrowRight size={14} className="text-ink-3" />
            </Link>
          ))}
        </div>
      </Section>
      <Section title="Your book">
        <div className="flex flex-wrap gap-1.5">
          {BOOK.map((s) => (
            <Link key={s} href={`/c/${s}`} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[12px] font-medium">
              {s}
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
