"use client";

/**
 * Be Care Compliant — the sortable name column every register shares.
 *
 * Phil, 2026-09-16: "when they click carer they need the option: A-Z First Name, Z-A First
 * Name, A-Z Surname, Z-A Surname."
 *
 * ONE COMPONENT FOR THE THREE REGISTERS — People, Service Users and Training — because a
 * sort that behaves differently on each is three things to learn instead of one.
 *
 * TWO ORDERS, NOT ONE, because they answer different questions. Surname order is how you
 * look somebody up against a paper file or a rota, and it is how every register already
 * arrives (the database orders by surname_key). First name order is how the team talks
 * about each other and how the names are actually written on screen, so scanning for
 * "Bethan" works. Both use the tested rules in lib/people/name-sort.
 *
 * A to Z First Name is the default (Phil, 2026-09-16), and the choice IS remembered: it is
 * saved on the user's profile by migration 0280, so it survives a page change, a sign out and
 * a different machine. It is set optimistically here so the rows reorder the instant you
 * choose, with the save going off behind it.
 *
 * The menu is rendered in a PORTAL, the same as PillSelect, because the header sits inside
 * the matrix's scrolling area and anything positioned normally would be clipped by it.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { bySurname, byGivenName } from "@/lib/people/name-sort";
import { setRegisterNameSort } from "@/lib/register/name-sort-actions";
import type { SortMode } from "@/lib/register/name-sort-pref";

export type { SortMode };

export const SORT_OPTIONS: ReadonlyArray<{ value: SortMode; label: string }> = [
  { value: "first_az", label: "A-Z First Name" },
  { value: "first_za", label: "Z-A First Name" },
  { value: "surname_az", label: "A-Z Surname" },
  { value: "surname_za", label: "Z-A Surname" },
];

/**
 * The chosen order, held here so the rows reorder immediately, and written to the profile so
 * it is still chosen tomorrow. `initial` comes from the server, which has already read it.
 */
export function useNameSort(initial: SortMode) {
  const [mode, setMode] = useState<SortMode>(initial);
  const [, startTransition] = useTransition();
  function choose(next: SortMode) {
    if (next === mode) return;
    setMode(next);
    // Saved behind the reorder, never in front of it: the rows must not wait on a round trip,
    // and a failed save is a preference that reverts next time, not an error on the screen.
    startTransition(async () => {
      await setRegisterNameSort(next);
    });
  }
  return { mode, setMode: choose };
}

/** Order rows by the chosen mode. Never mutates the list it is given. */
export function sortByName<T>(
  items: readonly T[],
  nameOf: (item: T) => unknown,
  mode: SortMode,
): T[] {
  const asc = mode.startsWith("first") ? byGivenName(items, nameOf) : bySurname(items, nameOf);
  return mode.endsWith("_az") ? asc : asc.reverse();
}

export function NameSortHeader({
  label,
  mode,
  onChange,
  className = "col-carer",
}: {
  label: string;
  mode: SortMode;
  onChange: (mode: SortMode) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = SORT_OPTIONS.find((o) => o.value === mode);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: r.bottom + 4, left: r.left, width: r.width });
    setOpen(true);
  }

  return (
    <th className={className} aria-sort={mode.endsWith("_az") ? "ascending" : "descending"}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        /* Centred, because .matrix th.col-carer centres its heading while the names below
           stay left aligned. The button must not quietly change that. */
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 font-[inherit] text-[inherit] uppercase tracking-[inherit] text-white/70 transition hover:text-white"
        title={`Sorted ${current?.label ?? ""}. Press to change.`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label}, sorted ${current?.label ?? ""}. Press to change the order.`}
      >
        {label}
        <span aria-hidden className="text-[0.65em] leading-none text-gold-400">
          {mode.endsWith("_az") ? "▲" : "▼"}
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: coords.top, left: coords.left, minWidth: Math.max(coords.width, 170) }}
            className="z-50 flex flex-col items-stretch gap-1 rounded-xl border border-white/15 bg-navy-900 p-2 shadow-2xl"
          >
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={o.value === mode}
                onClick={() => {
                  setOpen(false);
                  onChange(o.value);
                }}
                className={`cursor-pointer rounded-lg px-3 py-1.5 text-left text-xs font-semibold normal-case tracking-normal transition ${
                  o.value === mode ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </th>
  );
}
