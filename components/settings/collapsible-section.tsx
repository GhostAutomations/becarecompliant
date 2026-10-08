"use client";

/**
 * Be Care Compliant — a dropdown section, styled as the app's canonical field.
 *
 * Phil, 2026-07-26: "drop downs like the ones in the forms like the Completed by
 * field on a supervision form". So the header is not a card and not a bare line:
 * it is the same control a form select is, rounded-xl with the white/20 border,
 * the white/10 fill and a chevron on the right, sized like a field rather than
 * stretched across the page. It matches the Active users and Carers dropdowns in
 * Settings > Users (components/settings/user-dropdown.tsx), which use the identical
 * treatment.
 *
 * Two ways to open (Phil, 2026-10-08, of the Policies page: "those drop downs don't look like any
 * drop downs that we've ever made ... I do like the idea of there being two columns worth of drop
 * downs so the page isn't so long"):
 *   in place (the default): the contents open underneath and push the page down. `wide` stretches
 *     the button across the page, for contents that need the room (the Review register).
 *   floating: the contents open in a panel OVER the page, exactly like the Settings > Users
 *     dropdowns, closing on a click outside or Escape. For dropdowns laid out two per row, so
 *     opening one never shoves its neighbours about.
 *
 * The rows are rendered on the server and passed in as children, so this stays a
 * thin wrapper and nothing about the list moves to the client.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

export default function CollapsibleSection({
  title,
  subtitle,
  count,
  detail,
  defaultOpen = false,
  floating = false,
  wide = false,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Shown as "(n)" after the title. */
  count?: number;
  /** Shown on the right of the button, before the chevron, e.g. "0 of 3 in place". */
  detail?: string;
  defaultOpen?: boolean;
  /** Open as a panel over the page (see the module). */
  floating?: boolean;
  /** Stretch across the page instead of a field's width. Floating ones take their column. */
  wide?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const wrapRef = useRef<HTMLDivElement>(null);

  // A floating panel closes on a click outside it or Escape, as the Settings > Users ones do.
  useEffect(() => {
    if (!open || !floating) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, floating]);

  const button = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      title={floating ? subtitle : undefined}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-left text-sm text-white shadow-sm backdrop-blur${
        wide || floating ? "" : " sm:max-w-sm"
      }`}
    >
      <span className="min-w-0 truncate">
        {title}
        {count !== undefined ? ` (${count})` : ""}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {detail ? <span className="text-xs text-white/55">{detail}</span> : null}
        <span aria-hidden className={`opacity-60 transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </span>
    </button>
  );

  if (floating) {
    return (
      <div ref={wrapRef} className="relative w-full">
        {button}
        {open ? (
          <div className="absolute z-50 mt-1 flex max-h-80 w-full flex-col overflow-auto rounded-xl border border-white/15 bg-navy-900 p-1.5 shadow-2xl">
            {children}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className="space-y-3">
      {button}
      {open ? (
        <div className="space-y-2">
          {subtitle ? <p className="text-xs text-white/45">{subtitle}</p> : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}
