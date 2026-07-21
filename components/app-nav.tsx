"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavEntry } from "@/lib/nav";
import { NavIcon } from "@/components/nav-icon";

/** Gradient sidebar navigation (desktop). */
export function SidebarNav({ entries }: { entries: NavEntry[] }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  // A child is active on its own path, or on any extra pattern it declares (e.g. the
  // Outcomes register also lights up on a single service user's outcomes page).
  const childActiveFor = (c: NavEntry) =>
    isActive(c.href) || (c.activeMatch ?? []).some((p) => new RegExp(p).test(pathname));

  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {entries.map((entry) => {
        const children = entry.children ?? [];
        // Only ONE child is active at a time: the most specific match. This stops a
        // child that shares the parent's path (e.g. Compliance at /people) from also
        // lighting up on a deeper sibling route (e.g. /people/training).
        const activeChildHref = children
          .filter(childActiveFor)
          .sort((a, b) => b.href.length - a.href.length)[0]?.href;
        const childActive = activeChildHref != null;
        const inSection = isActive(entry.href);
        const active = inSection && !childActive;
        return (
          <div key={entry.href}>
            <Link
              href={entry.href}
              className={`dock-link ${active ? "dock-link-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <NavIcon icon={entry.icon} className="h-5 w-5" />
              {entry.label}
            </Link>
            {children.length > 0 && inSection && (
              <div className="mt-1 flex flex-col gap-1 pl-4">
                {children.map((child) => {
                  const cActive = child.href === activeChildHref;
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`dock-link py-1.5 text-[13px] ${cActive ? "dock-link-active" : ""}`}
                      aria-current={cActive ? "page" : undefined}
                    >
                      <NavIcon icon={child.icon} className="h-4 w-4" />
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** Dock-style bottom navigation (mobile). */
export function MobileDock({ entries }: { entries: NavEntry[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="sidebar-gradient fixed inset-x-4 bottom-4 z-40 flex items-center justify-around rounded-2xl border border-white/15 px-2 py-2 shadow-2xl backdrop-blur-xl md:hidden"
    >
      {entries.map((entry) => {
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
