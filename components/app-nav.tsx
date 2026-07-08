"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ENTRIES } from "@/lib/nav";
import { NavIcon } from "@/components/nav-icon";

/** Gradient sidebar navigation (desktop). */
export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {NAV_ENTRIES.map((entry) => {
        const active =
          pathname === entry.href || pathname.startsWith(`${entry.href}/`);
        return (
          <Link
            key={entry.href}
            href={entry.href}
            className={`dock-link ${active ? "dock-link-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <NavIcon icon={entry.icon} className="h-5 w-5" />
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Dock-style bottom navigation (mobile). */
export function MobileDock() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="sidebar-gradient fixed inset-x-4 bottom-4 z-40 flex items-center justify-around rounded-2xl border border-white/15 px-2 py-2 shadow-2xl backdrop-blur-xl md:hidden"
    >
      {NAV_ENTRIES.map((entry) => {
        const active =
          pathname === entry.href || pathname.startsWith(`${entry.href}/`);
        return (
          <Link
            key={entry.href}
            href={entry.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 rounded-xl px-4 py-1.5 text-[11px] font-medium transition ${
              active
                ? "bg-white/15 text-gold-300"
                : "text-white/70 hover:text-white"
            }`}
          >
            <NavIcon icon={entry.icon} className="h-5 w-5" />
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}
