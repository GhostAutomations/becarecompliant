"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavEntry } from "@/lib/nav";
import { splitMobileNav } from "@/lib/nav";
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

/**
 * Fixed bottom navigation (mobile).
 *
 * Phil, 2026-08-25: the old dock floated (inset-x-4 bottom-4) so it drifted on scroll
 * and jumped when the browser chrome or keyboard moved, and it crammed EVERY department
 * in. This bar is truly fixed to the bottom edge, sits above the home-indicator safe
 * area, and shows only a small role-aware set of primaries plus a "More" button that
 * opens the rest in a bottom sheet.
 */
export function MobileDock({
  entries,
  role,
}: {
  entries: NavEntry[];
  role: string;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const { primary, overflow } = splitMobileNav(role, entries);
  /*
   * MORE IS SHOWN WHENEVER THERE IS ANYTHING BEHIND IT, which now includes sub-pages.
   *
   * It used to appear only when departments overflowed the bar. A role with three or four
   * departments therefore had no More button, and since the sheet is the only place a phone can
   * reach a sub-page, Handover and the rest stayed unreachable for exactly the roles with the
   * simplest menus. A bar slot is worth less than a page nobody can open.
   */
  const hasChildren = entries.some((e) => (e.children ?? []).length > 0);
  const showMore = overflow.length > 0 || hasChildren;
  // Lit when the page you are on is not one of the tabs in the bar, so the bar always shows
  // where you are.
  const overflowActive = showMore && !primary.some((e) => isActive(e.href));

  /* Tight on purpose. The tab's NATURAL height is what sets the bar's height — the min-height in
     the stylesheet never bound, which is why raising and lowering it changed nothing at all
     (2026-09-04). Icon plate 28px, half-step padding, a 10px label: about 44pt of bar, plus the
     home-indicator inset that iOS requires below it. */
  const tabClass = (active: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-0.5 text-[10px] font-medium leading-tight transition ${
      active ? "text-gold-300" : "text-white/65 hover:text-white"
    }`;

  return (
    <>
      <nav aria-label="Main" className="mobile-dock md:hidden">
        <div className="mobile-dock-row">
          {primary.map((entry) => {
            const active = isActive(entry.href);
            return (
              <Link
                key={entry.href}
                href={entry.href}
                aria-current={active ? "page" : undefined}
                className={tabClass(active)}
              >
                <span
                  className={`flex h-7 w-full max-w-[64px] items-center justify-center rounded-xl transition ${
                    active ? "bg-white/15" : ""
                  }`}
                >
                  <NavIcon icon={entry.icon} className="h-5 w-5" />
                </span>
                <span className="max-w-full truncate">{entry.label}</span>
              </Link>
            );
          })}

          {showMore && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={tabClass(overflowActive)}
            >
              <span
                className={`flex h-7 w-full max-w-[64px] items-center justify-center rounded-xl transition ${
                  overflowActive ? "bg-white/15" : ""
                }`}
              >
                <MoreIcon className="h-5 w-5" />
              </span>
              <span className="max-w-full truncate">More</span>
            </button>
          )}
        </div>
      </nav>

      {/*
        THE SHEET GETS THE WHOLE MENU, not just the overflow (Phil, 2026-09-15: "go to out of
        hours, i can on see rota and not hand over, this is the same for all menu options people
        service user, you can only see the first page").

        Two separate holes made one bug. The sheet never rendered CHILDREN, so Handover, Absence
        and the Service User sub-departments had no route to them on a phone at all. And it only
        ever listed the OVERFLOW, so People and Service Users, which sit in the bottom bar, never
        appeared in it either: their sub-pages would still have been unreachable even once
        children were drawn.

        The bar is for the two or three places somebody jumps to all day. The sheet is the map.
      */}
      {moreOpen && (
        <MoreSheet
          entries={entries}
          isActive={isActive}
          onClose={() => setMoreOpen(false)}
        />
      )}
    </>
  );
}

/** Bottom sheet listing the overflow destinations. Portalled to <body> per the
 *  house rule (never inline), high z-index, closes on backdrop/tap/Escape. */
function MoreSheet({
  entries,
  isActive,
  onClose,
}: {
  entries: NavEntry[];
  isActive: (href: string) => boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Stop the page scrolling behind the open sheet.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="mobile-sheet-root md:hidden" role="dialog" aria-modal="true" aria-label="More">
      <button
        type="button"
        aria-label="Close menu"
        className="mobile-sheet-backdrop"
        onClick={onClose}
      />
      <div className="mobile-sheet-panel">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-white/90">More</span>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            Close
          </button>
        </div>
        {/*
          A ROW PER DEPARTMENT, with its sub-pages beneath it. The old three-column grid of icon
          tiles had nowhere to put a child, which is how they came to be left out: the layout
          could not express the thing the menu needed to say.

          The department itself stays tappable, because it is a real page (the Rota is On Call's
          landing page), and its children sit under it as chips rather than as a second grid, so
          the hierarchy is legible at a glance on a small screen.
        */}
        <nav aria-label="All destinations" className="space-y-1">
          {entries.map((entry) => {
            const children = entry.children ?? [];
            const selfActive = isActive(entry.href) && !children.some((c) => c.href !== entry.href && isActive(c.href));
            return (
              <div key={entry.href} className="rounded-2xl border border-white/10 bg-white/5 p-2">
                <Link
                  href={entry.href}
                  onClick={onClose}
                  aria-current={selfActive ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm font-medium transition ${
                    selfActive ? "bg-gold-400/10 text-gold-300" : "text-white/85 hover:bg-white/10"
                  }`}
                >
                  <NavIcon icon={entry.icon} className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 truncate">{entry.label}</span>
                </Link>
                {children.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1.5 pl-9">
                    {children.map((child) => {
                      /* A child that shares the department's href IS the department's landing
                         page, and is already reachable by the row above. Listing it twice reads
                         as a mistake, so it is only shown when it says something the row does
                         not: a different name, such as Rota under Out of Hours. */
                      const childActive = isActive(child.href) && child.href !== entry.href
                        ? true
                        : child.href === entry.href && selfActive;
                      return (
                        <Link
                          key={`${entry.href}-${child.href}-${child.label}`}
                          href={child.href}
                          onClick={onClose}
                          aria-current={childActive ? "page" : undefined}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                            childActive
                              ? "bg-gold-400/15 text-gold-300"
                              : "bg-white/5 text-white/70 hover:bg-white/10"
                          }`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </div>
    </div>,
    document.body,
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
