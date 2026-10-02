"use client";

/**
 * A dashboard tile that shows what sits behind its number (Phil, 2026-09-27).
 *
 * On a computer, hovering the tile opens a small panel under it: the first 8, soonest first,
 * each name opening that record, then "and X more" going to the tile's own list. Moving the
 * pointer into the panel keeps it open.
 * On a phone or tablet there is no hover, so the FIRST tap opens the panel and a SECOND tap on
 * the tile goes to the list, as a tap always did. Tapping anywhere else, or Escape, closes it.
 *
 * The tile itself is drawn by the dashboard exactly as before and passed in as children, so its
 * size and layout do not change. The lines come from buildDuePreview, the same function that
 * makes the number, so the list and the figure always agree.
 */
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PreviewLine } from "@/lib/dashboard/due-preview";

export default function PreviewTile({
  href,
  className = "",
  title,
  total,
  lines,
  emptyText,
  children,
}: {
  href: string;
  className?: string;
  title: string;
  total: number;
  lines: PreviewLine[];
  emptyText: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setCanHover(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  function show() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function hideSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  const more = total - lines.length;

  return (
    <div
      ref={wrap}
      className="relative flex flex-col"
      onMouseEnter={canHover ? show : undefined}
      onMouseLeave={canHover ? hideSoon : undefined}
    >
      <Link
        href={href}
        className={`glass-card glass-card-hover @container block flex-1 p-4 ${className}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          // No hover on this device: the first tap shows the panel, the second goes to the list.
          if (!canHover && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children}
      </Link>

      {open ? (
        <div
          role="dialog"
          aria-label={title}
          className="absolute left-0 right-0 top-full z-40 mt-2 rounded-xl border border-white/10 bg-navy-900/95 p-3 shadow-xl backdrop-blur"
        >
          <p className="mb-2 text-xs uppercase tracking-wide text-white/50">
            {title}
            <span className="ml-1 tabular-nums">({total})</span>
          </p>
          {lines.length === 0 ? (
            <p className="text-sm text-white/60">{emptyText}</p>
          ) : (
            <ul className="space-y-1">
              {lines.map((l) => (
                <li key={l.key}>
                  <Link
                    href={l.href}
                    className="flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.06]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white">{l.name}</span>
                      <span className="block truncate text-xs text-white/60">{l.detail}</span>
                    </span>
                    <span
                      className={`shrink-0 text-xs font-semibold ${l.tone === "red" ? "text-red-300" : "text-amber-300"}`}
                    >
                      {l.when}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {more > 0 ? (
            <Link
              href={href}
              className="mt-2 block rounded-lg px-2 py-1.5 text-xs font-semibold text-gold-300 hover:bg-white/[0.06]"
            >
              and {more} more
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
