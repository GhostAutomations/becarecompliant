"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavEntry } from "@/lib/nav";
import { NavIcon } from "@/components/nav-icon";

/**
 * Be Care Compliant — Acme-only "navy" shell: a far-left icon rail plus a
 * collapsible drawer, mirroring the design demo. The rail is the permanent nav;
 * moving the pointer over the rail opens the drawer, and hovering a rail icon
 * focuses the drawer on that department (no click needed). It stays open while
 * the pointer is over the rail or drawer, and closes when a department /
 * sub-department is clicked or the pointer leaves both.
 */
export default function NavyNav({
  entries,
  companyName,
  initials,
  homeHref,
}: {
  entries: NavEntry[];
  companyName: string;
  initials: string;
  homeHref: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<string>(entries[0]?.href ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  // Which top-level department the current page sits under (rail highlight).
  const inSection = (e: NavEntry) =>
    isActive(e.href) || (e.children ?? []).some((c) => isActive(c.href));

  const cancelClose = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    timer.current = setTimeout(() => setOpen(false), 60);
  };
  const openOn = (href: string) => {
    cancelClose();
    setFocus(href);
    setOpen(true);
  };

  // Line each rail icon up with the vertical centre of its department row in the
  // drawer, so the two columns match even when a department's sub-items expand.
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const align = () => {
      const railTop = rail.getBoundingClientRect().top;
      rail.querySelectorAll<HTMLElement>(".navy-ric[data-href]").forEach((ic) => {
        const href = ic.getAttribute("data-href");
        const wi = href
          ? document.querySelector<HTMLElement>(
              `.navy-wi.parent[data-href="${CSS.escape(href)}"]`,
            )
          : null;
        if (!wi) return;
        const r = wi.getBoundingClientRect();
        ic.style.top = `${r.top - railTop + r.height / 2 - ic.offsetHeight / 2}px`;
      });
    };
    align();
    const t = setTimeout(align, 60);
    window.addEventListener("resize", align);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", align);
    };
  }, [open, focus, pathname]);

  return (
    <>
      {/* Icon rail (desktop). Mobile keeps the existing bottom dock. */}
      <div
        ref={railRef}
        className="navy-rail hidden shrink-0 md:flex"
        onMouseEnter={() => {
          cancelClose();
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
      >
        <Link href={homeHref} className="navy-logo" aria-label="Home">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 2.5 4 6v6c0 4.4 3.2 7.6 8 9.5 4.8-1.9 8-5.1 8-9.5V6l-8-3.5Z"
              stroke="#111"
              strokeWidth="1.6"
            />
            <path
              d="m8.6 12 2.3 2.3 4.5-4.6"
              stroke="#111"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        {entries.map((e) => (
          <button
            key={e.href}
            type="button"
            data-href={e.href}
            title={e.label}
            aria-label={e.label}
            className={`navy-ric ${inSection(e) ? "on" : ""}`}
            onMouseEnter={() => openOn(e.href)}
            onClick={() => openOn(e.href)}
          >
            <NavIcon icon={e.icon} className="h-5 w-5" />
          </button>
        ))}
        <div className="navy-sp" />
        {companyName ? <div className="navy-brand">{companyName}</div> : null}
        <div className="navy-av">{initials}</div>
      </div>

      {/* Collapsible drawer (desktop). */}
      <aside
        className={`navy-drawer hidden md:block ${open ? "open" : ""}`}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        aria-hidden={!open}
      >
        <nav className="flex flex-col gap-1">
          {entries.map((entry) => {
            const children = entry.children ?? [];
            const showKids = open && entry.href === focus && children.length > 0;
            const activeChild = children.find((c) => isActive(c.href) && c.href !== entry.href);
            const parentOn = isActive(entry.href) && !activeChild;
            return (
              <div key={entry.href}>
                <Link
                  href={entry.href}
                  data-href={entry.href}
                  className={`navy-wi parent ${parentOn ? "on" : ""}`}
                  onClick={() => setOpen(false)}
                >
                  <NavIcon icon={entry.icon} className="h-4 w-4" />
                  {entry.label}
                </Link>
                {showKids
                  ? children.map((c) => (
                      <Link
                        key={c.href}
                        href={c.href}
                        className={`navy-wi child ${isActive(c.href) ? "on" : ""}`}
                        onClick={() => setOpen(false)}
                      >
                        {c.label}
                      </Link>
                    ))
                  : null}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
