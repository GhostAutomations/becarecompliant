"use client";

/**
 * Be Care Compliant — a dropdown section, styled as the app's canonical field.
 *
 * Phil, 2026-07-26: "drop downs like the ones in the forms like the Completed by
 * field on a supervision form". So the header is not a card and not a bare line:
 * it is the same control a form select is, rounded-xl with the white/20 border,
 * the white/10 fill and a chevron on the right, sized like a field rather than
 * stretched across the page. It matches the Additional branch views button in
 * the user popup, which uses the identical treatment.
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
        className="flex w-full items-center justify-between rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-left text-sm text-white shadow-sm backdrop-blur sm:max-w-sm"
      >
        <span>
          {title} ({count})
        </span>
        <span
          aria-hidden
          className={`ml-2 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open ? (
        <div className="space-y-2">
          {subtitle ? <p className="text-xs text-white/45">{subtitle}</p> : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}
