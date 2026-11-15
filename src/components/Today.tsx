"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { ArrowUpRight, ChevronDown, ChevronRight, GraduationCap, Handshake, Link2, SlidersHorizontal, Sparkles } from "lucide-react";
import type { Digest, DigestItem, MarketAlert } from "@/lib/digest";
import { toQuery, useSettings } from "@/lib/settings-client";
import { LeadList } from "./Leads";
import { SettingsSheet } from "./SettingsSheet";
import { ago, Avatar, Card, Chip, crore, Delta, Section, Skeleton, SyntheticBadge } from "./ui";

const WINDOWS = [
  { h: 24, label: "24h" },
  { h: 72, label: "3d" },
  { h: 168, label: "7d" },
  { h: 720, label: "30d" },
];

const short = (name: string) => name.replace(/\s*\(India\)|\s+(Ltd|Limited)\.?$/gi, "").replace(/\s+(Ltd|Limited)\.?$/i, "");

export function Today() {
  const { settings, update, ready } = useSettings();
  const [data, setData] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch below
    setLoading(true);
    fetch(`/api/digest?${toQuery(settings)}`)
      .then((r) => r.json())
      .then((d) => live && setData(d))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [settings, ready]);

  const act = data?.items.filter((i) => i.priority === 1) ?? [];
  const glance = data?.items.filter((i) => i.priority === 2) ?? [];
  const routine = data?.items.filter((i) => i.priority === 3) ?? [];
  const now = new Date();

  return (
    <div>
      <header className="flex items-start justify-between pt-2">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-ink-3">
            {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
          </p>
          <h1 className="mt-1 font-serif text-[30px] leading-[1.05] tracking-tight">
            {loading && !data ? "Reading the tape…" : act.length ? `${act.length} thing${act.length > 1 ? "s" : ""} need you.` : "Quiet book. Nothing needs you."}
          </h1>
        </div>
        <button onClick={() => setShowSettings(true)} aria-label="Settings" className="mt-1 rounded-full border border-line bg-surface p-2 text-ink-2">
          <SlidersHorizontal size={17} />
        </button>
      </header>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex rounded-full border border-line bg-surface p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w.h}
              onClick={() => update({ windowHours: w.h })}
              className={clsx("rounded-full px-3 py-1 text-[12px] font-medium", settings.windowHours === w.h ? "bg-ink text-bg" : "text-ink-2")}
            >
              {w.label}
            </button>
          ))}
        </div>
        {data && (
          <p className="text-[12px] text-ink-3">
            {data.counts.filings} filings · {data.counts.routine} routine hidden
          </p>
        )}
      </div>

      {data && <Pulse moves={data.moves} date={data.lastPriceDate} />}

      {loading && !data ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-32" />
          <Skeleton className="h-24" />
        </div>
      ) : data ? (
        <div className={clsx(loading && "opacity-60 transition-opacity")}>
          {act.length > 0 && (
            <Section title="Needs you">
              <div className="space-y-3">
                {act.map((i, k) => (
                  <ItemCard key={i.id} item={i} delay={k} />
                ))}
              </div>
            </Section>
          )}

          {data.alerts.length > 0 && (
            <Section title="Market moves" aside={<span className="text-[11px] text-ink-3">±{settings.priceMovePct}% · {settings.volMultiple}× vol · EOD {data.lastPriceDate}</span>}>
              <div className="space-y-2">
                {data.alerts.map((a) => (
                  <AlertRow key={a.symbol} a={a} />
                ))}
              </div>
            </Section>
          )}

          {data.nudges.length > 0 && (
            <Section title="Reasons to reconnect">
              <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 no-scrollbar">
                {data.nudges.map((n) => (
                  <Link key={n.person.id} href={`/p/${n.person.id}`} className="w-[230px] shrink-0 rounded-2xl border border-line bg-surface p-3.5">
                    <div className="flex items-center gap-2">
                      <Avatar name={n.person.name} size={28} />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold">{n.person.name}</p>
                        <p className="text-[11px] text-ink-3">Last spoke {Math.round(n.days / 30)} months ago</p>
                      </div>
                    </div>
                    <p className="mt-2 text-[12.5px] leading-snug text-ink-2">
                      {n.current ? "Their company" : `Their old firm, ${n.org},`} just had news: <span className="text-ink">{n.event.headline.slice(0, 70)}</span>
                    </p>
                  </Link>
                ))}
              </div>
            </Section>
          )}

          {glance.length > 0 && (
            <Section title="Worth a glance">
              <Card className="!p-0 divide-y divide-line">
                {glance.map((i) => (
                  <CompactRow key={i.id} item={i} />
                ))}
              </Card>
            </Section>
          )}

          {routine.length > 0 && <Routine items={routine} />}

          {data.items.length === 0 && data.alerts.length === 0 && (
            <Card className="mt-6 text-center text-[14px] text-ink-2">Nothing filed in this window. Try 7d.</Card>
          )}

          <p className="mt-8 text-center text-[11px] leading-relaxed text-ink-3">
            {data.counts.companies} holdings · filings via BSE/NSE (screener.in) · prices EOD {data.lastPriceDate}
            <br />
            Network profiles are synthetic for this demo.
          </p>
        </div>
      ) : null}

      {showSettings && <SettingsSheet settings={settings} update={update} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function Pulse({ moves, date }: { moves: Digest["moves"]; date: string | null }) {
  return (
    <div className="-mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 no-scrollbar" title={`End of day ${date}`}>
      {moves.map((m) => (
        <Link key={m.symbol} href={`/c/${m.symbol}`} className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1 text-[11.5px]">
          <span className="font-semibold">{m.symbol}</span> <Delta v={m.changePct} />
        </Link>
      ))}
    </div>
  );
}

function Header({ item }: { item: DigestItem }) {
  return (
    <div className="flex items-center gap-1.5 text-[11.5px]">
      <Link href={`/c/${item.symbol}`} className="font-semibold tracking-wide">
        {item.symbol}
      </Link>
      <span className="text-ink-3">·</span>
      <span className="text-ink-2">{item.label}</span>
      <span className="text-ink-3">· {ago(item.at)}</span>
      <span className="ml-auto flex gap-1">
        {item.scenario && <Chip tone="watch">Scenario</Chip>}
        {item.alert && <Chip tone="bad">Alert</Chip>}
      </span>
    </div>
  );
}

function contextFor(item: DigestItem) {
  return `saw ${short(item.company)}'s news (${item.label.toLowerCase()}: ${item.title.replace(/^.*?[–-]\s*/, "").slice(0, 70)})`;
}

function ItemCard({ item, delay }: { item: DigestItem; delay: number }) {
  return (
    <Card className="rise" >
      <div style={{ animationDelay: `${delay * 40}ms` }}>
        <Header item={item} />
        <h3 className="mt-2 font-serif text-[19px] leading-snug">{item.title.replace(/^Announcement under Regulation 30 \(LODR\)-/i, "")}</h3>
        {item.why ? (
          <p className="mt-1.5 flex gap-1.5 text-[13.5px] leading-snug text-ink">
            <Sparkles size={14} className="mt-[3px] shrink-0 text-net" />
            {item.why}
          </p>
        ) : (
          item.summary && <p className="mt-1.5 text-[13.5px] leading-snug text-ink-2">{item.summary}</p>
        )}
        {item.why && item.summary && <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">{item.summary}</p>}

        {item.results && <ResultsBlock r={item.results} />}
        {item.person && <PersonBlock p={item.person} />}
        {item.leads && item.leads.length > 0 && (
          <div className="mt-3 rounded-xl bg-net-bg/50 px-3 pt-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-net">Who can give you context</p>
            <LeadList leads={item.leads} context={contextFor(item)} />
          </div>
        )}

        <div className="mt-3 flex items-center gap-4 text-[12.5px] font-medium">
          {item.url.startsWith("http") && (
            <a href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-ink-2">
              Filing <ArrowUpRight size={13} />
            </a>
          )}
          <Link href={`/c/${item.symbol}`} className="flex items-center gap-1 text-ink-2">
            Research {item.symbol} <ChevronRight size={13} />
          </Link>
        </div>
      </div>
    </Card>
  );
}

function ResultsBlock({ r }: { r: NonNullable<DigestItem["results"]> }) {
  return (
    <div className="mt-3 rounded-xl border border-line">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-[11px] text-ink-3">
        <span>
          {r.period} · {r.source === "filing" ? `from the filing${r.basis ? ` (${r.basis})` : ""}` : "standardised (screener.in)"}
        </span>
        <span className="flex gap-6 pr-1">
          <span>QoQ</span>
          <span>YoY</span>
        </span>
      </div>
      {r.lines.map((l) => (
        <div key={l.key} className="flex items-center justify-between px-3 py-1.5 text-[13px]">
          <span className="w-16 text-ink-2">{l.label}</span>
          <span className="num flex-1 text-right font-medium">{crore(l.value)}</span>
          <span className="flex w-[104px] justify-end gap-3">
            <Delta v={l.qoq} digits={0} className="w-11 text-right" />
            <Delta v={l.yoy} digits={0} className="w-11 text-right" />
          </span>
        </div>
      ))}
      {r.margin.now != null && (
        <div className="border-t border-line px-3 py-1.5 text-[12px] text-ink-2">
          PAT margin <span className="num font-medium text-ink">{r.margin.now.toFixed(1)}%</span>
          {r.margin.yoyBps != null && (
            <span className={clsx("num ml-1", r.margin.yoyBps >= 0 ? "text-good" : "text-bad")}>
              ({r.margin.yoyBps >= 0 ? "+" : ""}
              {r.margin.yoyBps} bps YoY)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const KIND_ICON = { "worked-with": Handshake, "studied-with": GraduationCap, knows: Link2, "same-company-different-time": Link2 } as const;

function PersonBlock({ p }: { p: NonNullable<DigestItem["person"]> }) {
  const prof = p.profile;
  if (!prof)
    return (
      <div className="mt-3 rounded-xl border border-dashed border-line p-3 text-[12.5px] text-ink-2">
        <span className="font-semibold text-ink">{p.name}</span>
        {p.role ? ` · ${p.role}` : ""} — no profile on file. In production FINN resolves the name against a consented profile source and checks it against your network.
      </div>
    );
  return (
    <div className="mt-3 rounded-xl border border-line p-3">
      <Link href={`/p/${prof.id}`} className="flex items-center gap-2.5">
        <Avatar name={prof.name} size={36} tone="plain" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[14px] font-semibold">
            {prof.name} <SyntheticBadge />
          </p>
          <p className="truncate text-[12px] text-ink-3">{prof.education.map((e) => `${e.school} '${String(e.year).slice(2)}`).join(" · ")}</p>
        </div>
      </Link>
      <ol className="mt-2.5 space-y-1 border-l border-line pl-3">
        {[...prof.career].reverse().map((s) => (
          <li key={s.org + s.from} className="text-[12.5px] leading-snug">
            <span className="font-medium">{s.org}</span> <span className="text-ink-2">· {s.role}</span>{" "}
            <span className="num text-ink-3">
              {s.from}–{s.to ?? "now"}
            </span>
          </li>
        ))}
      </ol>
      {(p.overlaps.length > 0 || p.mine.length > 0) && (
        <div className="mt-3 space-y-1.5 border-t border-line pt-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-net">In your network</p>
          {p.mine.map((m) => (
            <p key={m} className="text-[12.5px] text-ink-2">
              {m}
            </p>
          ))}
          {p.overlaps.map((o) => {
            const Icon = KIND_ICON[o.kind];
            return (
              <Link key={o.person.id} href={`/p/${o.person.id}`} className="flex items-start gap-2 text-[12.5px] leading-snug">
                <Icon size={14} className="mt-[2px] shrink-0 text-net" />
                <span>
                  <span className="font-semibold">{o.person.name}</span> <span className="text-ink-2">— {o.detail}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AlertRow({ a }: { a: MarketAlert }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="!py-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold">
            {a.symbol} <span className="font-normal text-ink-3">{short(a.company)}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap gap-1">
            {a.reasons.map((r) => (
              <Chip key={r} tone={/-/.test(r) || /low/.test(r) ? "bad" : /high|\+/.test(r) ? "good" : "watch"}>
                {r}
              </Chip>
            ))}
          </p>
        </div>
        <div className="text-right">
          <p className="num text-[14px] font-semibold">₹{a.signal.close.toLocaleString("en-IN")}</p>
          <Delta v={a.signal.changePct} className="text-[12px]" />
        </div>
        <ChevronDown size={16} className={clsx("text-ink-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 border-t border-line pt-1">
          <p className="pt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-net">Ask before the market does</p>
          <LeadList leads={a.leads} context={`noticed the unusual move in ${short(a.company)} (${a.reasons.join(", ")})`} max={2} />
        </div>
      )}
    </Card>
  );
}

function CompactRow({ item }: { item: DigestItem }) {
  const inner = (
    <div className="flex gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Header item={item} />
        <p className="mt-1 text-[13.5px] leading-snug">{item.summary ?? item.title}</p>
      </div>
    </div>
  );
  return item.url.startsWith("http") ? (
    <a href={item.url} target="_blank" rel="noreferrer" className="block">
      {inner}
    </a>
  ) : (
    inner
  );
}

function Routine({ items }: { items: DigestItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-6">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between rounded-xl border border-dashed border-line px-4 py-2.5 text-[12.5px] text-ink-3">
        <span>
          {items.length} routine filing{items.length > 1 ? "s" : ""} — investor meets, AGM notices, compliance
        </span>
        <ChevronDown size={15} className={clsx("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 divide-y divide-line">
          {items.map((i) => (
            <a key={i.id} href={i.url} target="_blank" rel="noreferrer" className="flex gap-2 py-2 text-[12.5px]">
              <span className="w-20 shrink-0 font-semibold">{i.symbol}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{i.summary ?? i.title}</span>
              <span className="text-ink-3">{ago(i.at)}</span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
