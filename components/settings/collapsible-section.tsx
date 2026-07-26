"use client";

/**
 * Be Care Compliant — a dropdown section header.
 *
 * Deliberately NOT a card (Phil, 2026-07-26: "still tiles, i want them as drop
 * downs"). It is a slim line with a chevron that turns as it opens, so Active
 * users and Passive users read as two dropdowns rather than two panels, and the
 * cards below belong to the people, not to the heading.
 *
 * The rows are rendered on the server and passed in as children, so this stays a
 * thin wrapper and nothing about the user list moves to the client.
 */

import { useState, type ReactNode } from "react";

export default function CollapsibleSection({
  title,
  subtitle,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-b border-white/10 pb-2 text-left"
      >
        <span
          aria-hidden
          className={`text-xs text-white/40 transition-transform ${open ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <span className="text-sm font-semibold text-white">{title}</span>
        <span className="text-sm text-white/45">({count})</span>
      </button>

      {open ? (
        <div className="space-y-2 pt-3">
          {subtitle ? <p className="text-xs text-white/45">{subtitle}</p> : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}
