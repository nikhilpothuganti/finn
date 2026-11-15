"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowUpRight, BookOpen, CheckCircle2, CircleDashed, CircleSlash, FileText, Loader2, MinusCircle, Sparkles } from "lucide-react";
import type { Flag, numbers, QuarterGuidance, Verdict } from "@/lib/research";
import type { Lead } from "@/lib/types";
import { LeadList } from "./Leads";
import { ago, Card, Chip, crore, Delta, Section, Skeleton } from "./ui";

type Numbers = ReturnType<typeof numbers>;
interface CompanyData {
  company: {
    symbol: string; name: string; about: string; keyPoints: string; sector: string | null; industry: string | null;
    peers: { symbol: string; name: string }[]; fetchedAt: string; annualReports: { year: string; url: string }[];
    concalls: { period: string; transcriptUrl: string | null }[]; prices: [string, number][];
  };
  filings: { id: string; title: string; summary: string | null; url: string; at: string; label: string; priority: number }[];
  numbers: Numbers;
  leads: Lead[];
  hasAnalysis: boolean;
  error?: string;
}
interface Analysis { guidance: QuarterGuidance[]; verdict: Verdict; at: string; cached?: boolean }

const short = (n: string) => n.replace(/\s*\(India\)|\s+(Ltd|Limited)\.?$/gi, "").replace(/\s+(Ltd|Limited)\.?$/i, "");

export function CompanyView({ symbol }: { symbol: string }) {
  const [d, setD] = useState<CompanyData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [aErr, setAErr] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setAErr(null);
    setProgress([]);
    const res = await fetch(`/api/research/${symbol}`);
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l.trim()) continue;
        const m = JSON.parse(l);
        if (m.type === "progress") setProgress((p) => [...p, m.message]);
        if (m.type === "result") setAnalysis(m);
        if (m.type === "error") setAErr(m.message);
      }
    }
    setRunning(false);
  }, [symbol]);

  useEffect(() => {
    fetch(`/api/company/${symbol}`)
      .then((r) => r.json())
      .then((j: CompanyData) => {
        if (j.error) setErr(j.error);
        else {
          setD(j);
          if (j.hasAnalysis) run(); // already computed → instant from cache
        }
      })
      .catch(() => setErr("Network error"));
  }, [symbol, run]);

  if (err)
    return (
      <div className="pt-4">
        <Back />
        <Card className="mt-4 text-[14px]">{err}. Check the NSE symbol (e.g. INFY, not Infosys).</Card>
      </div>
    );
  if (!d)
    return (
      <div className="pt-4">
        <Back />
        <Skeleton className="mt-4 h-8 w-40" />
        <Skeleton className="mt-3 h-40" />
        <Skeleton className="mt-3 h-64" />
      </div>
    );

  const { company: c, numbers: n } = d;
  const price = n.snapshot.price;
  const closes = c.prices.map((p) => p[1]);
  const yr = closes.length > 1 ? ((closes.at(-1)! - closes[0]) / closes[0]) * 100 : null;

  return (
    <div className="pt-2">
      <Back />
      <header className="mt-3">
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-3">
          {c.symbol} · {c.industry ?? c.sector}
        </p>
        <h1 className="mt-1 font-serif text-[28px] leading-tight tracking-tight">{short(c.name)}</h1>
        {price && (
          <p className="mt-1 flex items-baseline gap-2">
            <span className="num text-[22px] font-semibold">₹{price.close.toLocaleString("en-IN")}</span>
            <Delta v={price.changePct} className="text-[13px]" />
            <span className="text-[12px] text-ink-3">
              1y <Delta v={yr} digits={0} />
            </span>
          </p>
        )}
        <PriceChart closes={closes} />
        <div className="-mx-4 mt-2 flex gap-4 overflow-x-auto px-4 text-[12px] no-scrollbar">
          {["Market Cap", "Stock P/E", "ROCE", "ROE", "Dividend Yield"].map((k) =>
            n.snapshot.ratios[k] ? (
              <div key={k} className="shrink-0">
                <p className="text-ink-3">{k.replace("Stock ", "")}</p>
                <p className="num font-semibold">{n.snapshot.ratios[k].replace("₹ ", "₹")}</p>
              </div>
            ) : null,
          )}
        </div>
      </header>

      {n.flags.length > 0 && (
        <Section title="What the numbers say">
          <div className="space-y-1.5">
            {n.flags.map((f) => (
              <FlagRow key={f.text} f={f} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Promised vs delivered" aside={<span className="text-[11px] text-ink-3">last 4 concalls · primary only</span>}>
        {analysis ? (
          <VerdictView a={analysis} leads={d.leads} name={short(c.name)} />
        ) : running ? (
          <Card>
            <div className="space-y-1.5">
              {progress.map((p, i) => (
                <p key={i} className="flex items-center gap-2 text-[13px] text-ink-2">
                  {i === progress.length - 1 ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} className="text-good" />}
                  {p}
                </p>
              ))}
              {!progress.length && (
                <p className="flex items-center gap-2 text-[13px] text-ink-2">
                  <Loader2 size={14} className="animate-spin" /> Fetching transcripts…
                </p>
              )}
            </div>
          </Card>
        ) : (
          <Card>
            <p className="text-[13.5px] leading-snug text-ink-2">
              Read management&apos;s last four earnings calls, pull every checkable promise, and score it against what was actually reported.
            </p>
            {aErr && <p className="mt-2 text-[12.5px] text-bad">{aErr}</p>}
            <button onClick={run} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-2.5 text-[14px] font-medium text-bg active:scale-[0.99]">
              <Sparkles size={15} /> Analyse management (~1 min)
            </button>
          </Card>
        )}
      </Section>

      <Section title="Who to call">
        <Card className="!py-1">
          {d.leads.length ? <LeadList leads={d.leads} context={`I'm digging into ${short(c.name)}`} max={5} /> : <p className="py-3 text-[13px] text-ink-2">No one in your network has worked here, at a competitor, or in this space. A gap worth filling.</p>}
        </Card>
      </Section>

      <Section title="Quarterly trend" aside={<span className="text-[11px] text-ink-3">₹ cr · reported</span>}>
        <QuarterTable n={n} />
      </Section>

      <Section title="Five-year shape">
        <Trajectory n={n} />
      </Section>

      <Section title="Business" aside={<span className="text-[11px] text-ink-3">from company documents</span>}>
        <Card>
          <p className="text-[13.5px] leading-relaxed text-ink-2">{c.about}</p>
          {c.keyPoints && <pre className="mt-3 whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-ink-2">{c.keyPoints.slice(0, 700)}</pre>}
          {c.peers.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="text-ink-3">Peers</span>
              {c.peers.map((p) => (
                <Link key={p.symbol} href={`/c/${p.symbol}`} className="rounded-md bg-surface-2 px-1.5 py-0.5 font-medium">
                  {p.symbol}
                </Link>
              ))}
            </div>
          )}
        </Card>
      </Section>

      <Section title="Recent filings">
        <Card className="!p-0 divide-y divide-line">
          {d.filings.map((f) => (
            <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="block px-4 py-2.5">
              <p className="flex items-center gap-1.5 text-[11.5px]">
                <Chip tone={f.priority === 1 ? "ink" : "plain"}>{f.label}</Chip>
                <span className="text-ink-3">{ago(f.at)} ago</span>
              </p>
              <p className="mt-1 text-[13px] leading-snug">{f.summary ?? f.title}</p>
            </a>
          ))}
        </Card>
      </Section>

      <Section title="Sources">
        <div className="space-y-1 text-[12.5px]">
          {(analysis?.guidance ?? []).map((g) => (
            <a key={g.url} href={g.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-ink-2">
              <FileText size={13} /> Concall transcript · {g.period} <ArrowUpRight size={12} />
            </a>
          ))}
          {c.annualReports.map((r) => (
            <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-ink-2">
              <BookOpen size={13} /> Annual report {r.year} <ArrowUpRight size={12} />
            </a>
          ))}
          <p className="pt-1 text-[11px] text-ink-3">Financials standardised by screener.in from exchange filings · refreshed {ago(c.fetchedAt)} ago</p>
        </div>
      </Section>
    </div>
  );
}

function Back() {
  return (
    <Link href="/research" className="inline-flex items-center gap-1 text-[13px] text-ink-3">
      <ArrowLeft size={15} /> Research
    </Link>
  );
}

function PriceChart({ closes }: { closes: number[] }) {
  if (closes.length < 2) return null;
  const w = 448, h = 84;
  const min = Math.min(...closes), max = Math.max(...closes);
  const pts = closes.map((v, i) => [(i / (closes.length - 1)) * w, h - ((v - min) / (max - min || 1)) * (h - 6) - 3]);
  const line = pts.map((p) => p.join(",")).join(" ");
  const up = closes.at(-1)! >= closes[0];
  const col = up ? "var(--good)" : "var(--bad)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-[84px] w-full" preserveAspectRatio="none" aria-label="One-year price">
      <defs>
        <linearGradient id="pg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={col} stopOpacity="0.16" />
          <stop offset="1" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill="url(#pg)" />
      <polyline points={line} fill="none" stroke={col} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function FlagRow({ f }: { f: Flag }) {
  return (
    <div className={clsx("flex items-start gap-2 rounded-xl px-3 py-2 text-[13px] leading-snug", f.tone === "good" ? "bg-good-bg" : f.tone === "bad" ? "bg-bad-bg" : "bg-watch-bg")}>
      <span className={clsx("mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full", f.tone === "good" ? "bg-good" : f.tone === "bad" ? "bg-bad" : "bg-watch")} />
      {f.text}
    </div>
  );
}

const V_ICON = {
  delivered: { Icon: CheckCircle2, cls: "text-good", label: "Delivered" },
  partly: { Icon: MinusCircle, cls: "text-watch", label: "Partly" },
  missed: { Icon: CircleSlash, cls: "text-bad", label: "Missed" },
  too_early: { Icon: CircleDashed, cls: "text-ink-3", label: "Too early" },
  unverifiable: { Icon: CircleDashed, cls: "text-ink-3", label: "Can't verify" },
} as const;

function VerdictView({ a, leads, name }: { a: Analysis; leads: Lead[]; name: string }) {
  const v = a.verdict;
  const score = v.credibility == null ? null : Math.max(0, Math.min(10, v.credibility));
  const tally = v.promises.reduce<Record<string, number>>((m, p) => ({ ...m, [p.verdict]: (m[p.verdict] ?? 0) + 1 }), {});
  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0">
            <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--line)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke={score == null ? "var(--line)" : score >= 7 ? "var(--good)" : score >= 4 ? "var(--watch)" : "var(--bad)"} strokeWidth="3" strokeDasharray={`${((score ?? 0) / 10) * 97.4} 97.4`} strokeLinecap="round" />
            </svg>
            <span className="num absolute inset-0 flex items-center justify-center text-[18px] font-semibold">{score == null ? "–" : score.toFixed(score % 1 ? 1 : 0)}</span>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
              Management credibility {score == null ? "· not enough checkable promises yet" : `· ${v.checked} promises checked`}
            </p>
            <p className="mt-0.5 font-serif text-[17px] leading-snug">{v.credibility_line}</p>
            <p className="mt-1 flex gap-2 text-[11.5px] text-ink-3">
              {(["delivered", "partly", "missed", "too_early", "unverifiable"] as const).map((k) => (tally[k] ? <span key={k}>{tally[k]} {V_ICON[k].label.toLowerCase()}</span> : null))}
            </p>
          </div>
        </div>
      </Card>

      <Card className="!p-0 divide-y divide-line">
        {v.promises.map((p, i) => {
          const { Icon, cls, label } = V_ICON[p.verdict];
          return (
            <div key={i} className="px-4 py-3">
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="text-ink-3">Said in {p.said_in}</span>
                <span className={clsx("flex items-center gap-1 font-semibold", cls)}>
                  <Icon size={13} /> {label}
                </span>
              </div>
              <p className="mt-1 text-[13.5px] font-medium leading-snug">“{p.promise}”</p>
              <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{p.delivered}</p>
            </div>
          );
        })}
      </Card>

      {v.narrative_vs_numbers.length > 0 && (
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">Narrative vs numbers</p>
          <div className="mt-2 space-y-2.5">
            {v.narrative_vs_numbers.map((x, i) => (
              <div key={i} className="text-[13px] leading-snug">
                <p>
                  <span className={clsx("mr-1.5 font-semibold", x.agrees ? "text-good" : "text-bad")}>{x.agrees ? "Agrees" : "Diverges"}</span>
                  {x.claim}
                </p>
                <p className="text-ink-2">{x.reality}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Card className="!p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-good">Bull</p>
          <ul className="mt-1.5 space-y-1.5 text-[12.5px] leading-snug">{v.bull.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </Card>
        <Card className="!p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-bad">Bear</p>
          <ul className="mt-1.5 space-y-1.5 text-[12.5px] leading-snug">{v.bear.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </Card>
      </div>

      {v.guidance_now.length > 0 && (
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">Current guidance</p>
          <ul className="mt-1.5 space-y-1 text-[13px] leading-snug">{v.guidance_now.map((g, i) => <li key={i}>· {g}</li>)}</ul>
        </Card>
      )}

      {v.questions.length > 0 && (
        <Card className="bg-net-bg/40">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-net">Questions worth asking</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[13px] leading-snug">{v.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
          {leads[0] && (
            <p className="mt-2 text-[12px] text-ink-2">
              Best person to put them to: <Link href={`/p/${leads[0].person.id}`} className="font-semibold text-net">{leads[0].person.name}</Link> — {leads[0].reasons[0].toLowerCase()}.
            </p>
          )}
        </Card>
      )}
      <p className="text-[11px] text-ink-3">
        Extracted with gpt-oss-20b from keyword-retrieved transcript passages, judged by gpt-oss-120b against reported numbers. {a.cached ? "Cached result." : ""} Generated {ago(a.at)} ago for {name}.
      </p>
    </div>
  );
}

function QuarterTable({ n }: { n: Numbers }) {
  const q = n.quarters;
  // Open scrolled to the latest quarter — that's the one the investor came for.
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);
  return (
    <div ref={ref} className="overflow-x-auto rounded-2xl border border-line bg-surface no-scrollbar">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-ink-3">
            <th className="sticky left-0 bg-surface px-3 py-2 text-left font-medium"> </th>
            {q.map((x) => (
              <th key={x.p} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                {x.p.replace(/(\w{3}) 20(\d\d)/, "$1 ’$2")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="num">
          <tr className="border-t border-line">
            <td className="sticky left-0 bg-surface px-3 py-1.5 text-ink-2">Revenue</td>
            {q.map((x) => <td key={x.p} className="px-2 text-right">{x.revenue?.toLocaleString("en-IN") ?? "—"}</td>)}
          </tr>
          <tr>
            <td className="sticky left-0 bg-surface px-3 py-1.5 text-ink-2">YoY</td>
            {q.map((x) => <td key={x.p} className="px-2 text-right"><Delta v={x.revYoY} digits={0} /></td>)}
          </tr>
          <tr>
            <td className="sticky left-0 bg-surface px-3 py-1.5 text-ink-2">{n.lender ? "PAT %" : "EBITDA %"}</td>
            {q.map((x) => <td key={x.p} className="px-2 text-right">{x.margin?.toFixed(1) ?? "—"}</td>)}
          </tr>
          <tr>
            <td className="sticky left-0 bg-surface px-3 py-1.5 text-ink-2">PAT</td>
            {q.map((x) => <td key={x.p} className="px-2 text-right">{x.pat?.toLocaleString("en-IN") ?? "—"}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Bars({ data, fmt, tone = "ink" }: { data: { p: string; v: number | null }[]; fmt: (v: number) => string; tone?: "ink" | "good" }) {
  const max = Math.max(...data.map((d) => Math.abs(d.v ?? 0)), 1);
  return (
    <div className="flex h-24 items-end gap-1.5">
      {data.map((d) => (
        <div key={d.p} className="flex flex-1 flex-col items-center gap-1">
          <span className="num text-[9.5px] text-ink-3">{d.v != null ? fmt(d.v) : ""}</span>
          <div className={clsx("w-full rounded-t", (d.v ?? 0) < 0 ? "bg-bad" : tone === "good" ? "bg-good/70" : "bg-ink/80")} style={{ height: `${(Math.abs(d.v ?? 0) / max) * 64}px` }} />
          <span className="text-[9.5px] text-ink-3">’{d.p.slice(-2)}</span>
        </div>
      ))}
    </div>
  );
}

function Trajectory({ n }: { n: Numbers }) {
  const t = n.trajectory;
  const k = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : v.toFixed(0));
  const lastBs = n.balance.at(-1);
  return (
    <div className="grid grid-cols-1 gap-2">
      <Card>
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] font-semibold">Revenue</p>
          <p className="text-[12px] text-ink-2">
            3y CAGR <Delta v={t.revC3} digits={0} /> · PAT <Delta v={t.patC3} digits={0} />
          </p>
        </div>
        <div className="mt-2">
          <Bars data={t.rev} fmt={k} />
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-2">
        <Card className="!p-3">
          <p className="text-[12px] text-ink-3">{n.lender ? "PAT margin" : "EBITDA margin"}</p>
          <p className="num mt-0.5 text-[18px] font-semibold">{t.margins.at(-1)?.ebitda?.toFixed(1) ?? "—"}%</p>
          <p className="num text-[11.5px] text-ink-3">vs {t.margins[0]?.ebitda?.toFixed(1) ?? "—"}% in {t.margins[0]?.p.slice(-4)}</p>
        </Card>
        <Card className="!p-3">
          <p className="text-[12px] text-ink-3">{n.lender ? "Borrowings" : "Debt / equity"}</p>
          <p className="num mt-0.5 text-[18px] font-semibold">{n.lender ? crore(lastBs?.debt) : `${lastBs?.de?.toFixed(2) ?? "—"}×`}</p>
          <p className="num text-[11.5px] text-ink-3">net worth {crore(lastBs?.equity)}</p>
        </Card>
        {!n.lender && (
          <Card className="!p-3">
            <p className="text-[12px] text-ink-3">Cash conversion (5y)</p>
            <p className={clsx("num mt-0.5 text-[18px] font-semibold", (n.cash.conversion ?? 1) < 0.7 && "text-bad")}>{n.cash.conversion != null ? `${(n.cash.conversion * 100).toFixed(0)}%` : "—"}</p>
            <p className="text-[11.5px] text-ink-3">operating cash ÷ PAT</p>
          </Card>
        )}
        {!n.lender && (
          <Card className="!p-3">
            <p className="text-[12px] text-ink-3">Cash cycle</p>
            <p className="num mt-0.5 text-[18px] font-semibold">{n.workingCapital.ccc.at(-1)?.v?.toFixed(0) ?? "—"} days</p>
            <p className="num text-[11.5px] text-ink-3">debtor days {n.workingCapital.debtor.at(-1)?.v?.toFixed(0) ?? "—"}</p>
          </Card>
        )}
      </div>
      {!n.lender && (
        <Card>
          <p className="text-[13px] font-semibold">Free cash flow</p>
          <div className="mt-2">
            <Bars data={n.cash.fcf} fmt={k} tone="good" />
          </div>
        </Card>
      )}
    </div>
  );
}
