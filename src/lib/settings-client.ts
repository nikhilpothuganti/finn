"use client";

import { useEffect, useState } from "react";
import type { Settings } from "./digest";

// Viewer-local preferences (window, thresholds, categories). Lives in localStorage — it's a
// per-device convenience, and the server stays stateless.
export const DEFAULTS: Settings = {
  windowHours: 24,
  priceMovePct: 4,
  volMultiple: 2,
  alertCategories: ["results", "M&A", "management_change", "litigation", "pledging", "fund_raise", "capex"],
  scenarios: true,
};

const KEY = "finn.settings.v1";

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage once on mount
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
    setReady(true);
  }, []);
  const update = (patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  return { settings, update, ready };
}

export const toQuery = (s: Settings) =>
  new URLSearchParams({
    window: String(s.windowHours),
    price: String(s.priceMovePct),
    vol: String(s.volMultiple),
    cats: s.alertCategories.join(","),
    scenarios: s.scenarios ? "1" : "0",
  }).toString();
