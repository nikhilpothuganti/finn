"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, Search, Users } from "lucide-react";
import clsx from "clsx";

const TABS = [
  { href: "/", label: "Today", icon: Newspaper, match: (p: string) => p === "/" },
  { href: "/research", label: "Research", icon: Search, match: (p: string) => p.startsWith("/research") || p.startsWith("/c/") },
  { href: "/network", label: "Network", icon: Users, match: (p: string) => p.startsWith("/network") || p.startsWith("/p/") },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-[480px] justify-around">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <Link
              key={href}
              href={href}
              className={clsx("flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium", active ? "text-ink" : "text-ink-3")}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.7} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
