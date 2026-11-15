"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import type { Settings } from "@/lib/digest";
import type { Category } from "@/lib/types";

const CATS: [Category, string][] = [
  ["results", "Results"],
  ["M&A", "M&A"],
  ["management_change", "Management change"],
  ["litigation", "Litigation & regulatory"],
  ["fund_raise", "Fund raise"],
  ["capex", "Capex"],
  ["pledging", "Promoter pledge"],
  ["credit_rating", "Credit rating"],
  ["insider_trading", "Insider trades"],
];

export function SettingsSheet({ settings, update, onClose }: { settings: Settings; update: (p: Partial<Settings>) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={onClose}>
      <div className="rise mx-auto max-h-[85dvh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[max(env(safe-area-inset-bottom),24px)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-[22px]">What counts as unusual</h2>
          <button onClick={onClose} className="rounded-full p-1 text-ink-3">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-[13px] text-ink-2">You set the thresholds. FINN watches end-of-day data and filings against them.</p>

        <Slider label="Price move in a day" value={settings.priceMovePct} min={1} max={10} step={0.5} fmt={(v) => `±${v}%`} onChange={(v) => update({ priceMovePct: v })} />
        <Slider label="Volume vs 20-day average" value={settings.volMultiple} min={1.2} max={5} step={0.1} fmt={(v) => `${v.toFixed(1)}×`} onChange={(v) => update({ volMultiple: v })} />

        <p className="mt-6 text-[13px] font-semibold">Alert me on</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {CATS.map(([c, label]) => {
            const on = settings.alertCategories.includes(c);
            return (
              <button
                key={c}
                onClick={() => update({ alertCategories: on ? settings.alertCategories.filter((x) => x !== c) : [...settings.alertCategories, c] })}
                className={clsx("rounded-full border px-3 py-1.5 text-[12.5px]", on ? "border-ink bg-ink text-bg" : "border-line text-ink-2")}
              >
                {label}
              </button>
            );
          })}
        </div>

        <label className="mt-6 flex items-center justify-between rounded-xl border border-line p-3">
          <span>
            <span className="block text-[13px] font-semibold">Demo scenarios</span>
            <span className="block text-[12px] text-ink-3">Inject 5 labelled fictional filings (CFO change, M&A, USFDA, capex) so every flow is visible.</span>
          </span>
          <input type="checkbox" checked={settings.scenarios} onChange={(e) => update({ scenarios: e.target.checked })} className="h-5 w-5 accent-[var(--net)]" />
        </label>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, fmt, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div className="mt-5">
      <div className="flex justify-between text-[13px]">
        <span className="font-semibold">{label}</span>
        <span className="num font-semibold">{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[var(--ink)]" />
    </div>
  );
}
