"use client";

/**
 * Be Care Compliant — a collapsed section in a Team Member's own area.
 *
 * Phil, 2026-07-27: "lets have policies i have signed and forms i have sent in
 * collapsed also lets have them look the same as they are currently different. i
 * like forms i have sent in".
 *
 * So this keeps the look he likes (the uppercase section heading over glass
 * rows) and only adds the fold. Both history sections use it, which is the point:
 * what a Team Member still has to DO stays open, and what they have already done
 * is one tap away instead of pushing the work off the screen.
 */

import { useState, type ReactNode } from "react";

export default function MySection({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count: number;
  children: ReactNode;
  /** Start open. Added 2026-08-11 for My training: folded is right for history, but a section
   *  holding something that has actually LAPSED must not hide it behind a tap. Only the
   *  initial state, so the fold still works normally once touched. */
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
        <span
          aria-hidden
          className={`text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {open ? children : null}
    </section>
  );
}
