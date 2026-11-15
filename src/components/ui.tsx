"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

export function Delta({ v, digits = 1, className }: { v: number | null | undefined; digits?: number; className?: string }) {
  if (v == null || !Number.isFinite(v)) return <span className={clsx("num text-ink-3", className)}>—</span>;
  return (
    <span className={clsx("num font-medium", v > 0 ? "text-good" : v < 0 ? "text-bad" : "text-ink-2", className)}>
      {v > 0 ? "+" : ""}
      {v.toFixed(digits)}%
    </span>
  );
}

export function Chip({ children, tone = "plain", className }: { children: ReactNode; tone?: "plain" | "good" | "bad" | "watch" | "net" | "ink"; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        tone === "plain" && "bg-surface-2 text-ink-2",
        tone === "good" && "bg-good-bg text-good",
        tone === "bad" && "bg-bad-bg text-bad",
        tone === "watch" && "bg-watch-bg text-watch",
        tone === "net" && "bg-net-bg text-net",
        tone === "ink" && "bg-ink text-bg",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({ name, size = 36, tone = "net" }: { name: string; size?: number; tone?: "net" | "plain" }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", tone === "net" ? "bg-net-bg text-net" : "bg-surface-2 text-ink-2")}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}

export function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("mt-7", className)}>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={clsx("rounded-2xl border border-line bg-surface p-4", onClick && "cursor-pointer", className)}>
      {children}
    </div>
  );
}

export function Spark({ values, w = 72, h = 24, className }: { values: number[]; w?: number; h?: number; className?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 2) - 1}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden>
      <polyline points={pts} fill="none" stroke={up ? "var(--good)" : "var(--bad)"} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton", className)} />;
}

export function SyntheticBadge() {
  return (
    <span title="Fictional profile used for the demo" className="rounded border border-dashed border-ink-3/50 px-1 text-[9px] font-medium uppercase tracking-wider text-ink-3">
      synthetic
    </span>
  );
}

export function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export const crore = (v: number | null | undefined) =>
  v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")} cr`;
