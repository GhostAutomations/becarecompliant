"use client";

/**
 * Be Care Compliant — a collapsed section with a count in the header.
 *
 * Built for Settings > Users, where Team Member logins now outnumber the people
 * who run the service many times over: a 60 carer agency would otherwise bury its
 * three Admins in a scroll. Both groups start closed, so the page opens as two
 * lines with counts and you expand the one you want.
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
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="glass-card flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-white/[0.07]"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">
            {title} ({count})
          </span>
          {subtitle ? (
            <span className="block text-xs text-white/50">{subtitle}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-xs text-white/50">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? <div className="space-y-3">{children}</div> : null}
    </section>
  );
}
