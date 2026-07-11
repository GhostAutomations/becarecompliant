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

  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {entries.map((entry) => {
        const children = entry.children ?? [];
        // Children (our "Sub Departments") only appear once you are inside this section.
        const childActive = children.some((c) => isActive(c.href));
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
                  const cActive = isActive(child.href);
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
