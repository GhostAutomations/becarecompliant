"use client";

/**
 * Be Care Compliant — a Briefings list that folds up (Phil, 2026-10-08: "They need to be
 * collapsible, otherwise they're just massively open"). Same heading and arrow as Completed,
 * closed when the page opens.
 */

import { useState, type ReactNode } from "react";

export default function FoldSection({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          {title} ({count})
        </h2>
        <span aria-hidden className={`text-white/40 transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {open ? children : null}
    </section>
  );
}
