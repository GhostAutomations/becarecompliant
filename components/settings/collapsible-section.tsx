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

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** The button itself: the one look every dropdown section shares. */
function DropdownButton({
  title,
  count,
  detail,
  open,
  onClick,
  hint,
  fieldWidth = false,
}: {
  title: string;
  count?: number;
  detail?: string;
  open: boolean;
  onClick: () => void;
  hint?: string;
  /** A field's width on a wide screen rather than its whole column. */
  fieldWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      title={hint}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-left text-sm text-white shadow-sm backdrop-blur${
        fieldWidth ? " sm:max-w-sm" : ""
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
}

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
    <DropdownButton
      title={title}
      count={count}
      detail={detail}
      open={open}
      onClick={() => setOpen((v) => !v)}
      hint={floating ? subtitle : undefined}
      fieldWidth={!(wide || floating)}
    />
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

/**
 * Several dropdowns on ONE LINE, each opening its contents FULL WIDTH underneath the row (Phil,
 * 2026-10-08: "can we get review register to the left and then library to the right so they're
 * both on one line"). Their rows carry dropdowns and buttons, so half the page would make every row
 * tall again; the contents take the whole width instead. Each opens and closes on its own.
 *
 * On a phone the buttons stack, and each one's contents open directly under ITS button rather than
 * under the last one: the grid order is set per screen size (button, contents, button, contents on
 * a phone; the buttons first, then the contents, on a wide screen).
 */
export function CollapsibleRow({
  items,
}: {
  items: Array<{ key: string; title: string; count?: number; detail?: string; children: ReactNode }>;
}) {
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const n = items.length;
  const order = (phone: number, wide: number) => ({ "--o": phone, "--o-sm": wide }) as CSSProperties;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.flatMap((it, i) => {
        const open = openKeys.includes(it.key);
        const cells = [
          <div key={`${it.key}-button`} style={order(2 * i + 1, i + 1)} className="[order:var(--o)] sm:[order:var(--o-sm)]">
            <DropdownButton
              title={it.title}
              count={it.count}
              detail={it.detail}
              open={open}
              onClick={() => setOpenKeys((k) => (k.includes(it.key) ? k.filter((x) => x !== it.key) : [...k, it.key]))}
            />
          </div>,
        ];
        if (open) {
          cells.push(
            <div
              key={`${it.key}-contents`}
              style={order(2 * i + 2, n + i + 1)}
              className="space-y-2 [order:var(--o)] sm:col-span-2 sm:[order:var(--o-sm)]"
            >
              {openKeys.length > 1 ? (
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">{it.title}</p>
              ) : null}
              {it.children}
            </div>,
          );
        }
        return cells;
      })}
    </div>
  );
}
