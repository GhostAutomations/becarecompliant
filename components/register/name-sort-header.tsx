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

import { useState, useTransition } from "react";
import { SortMenuHeader, type SortMenuOption } from "@/components/register/sort-menu-header";
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
const NAME_MENU: ReadonlyArray<SortMenuOption<SortMode>> = SORT_OPTIONS.map((o) => ({
  ...o,
  ascending: o.value.endsWith("_az"),
}));

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
  active = true,
}: {
  label: string;
  mode: SortMode;
  onChange: (mode: SortMode) => void;
  className?: string;
  /** False while another column (a training course) is ordering the rows. */
  active?: boolean;
}) {
  return (
    <SortMenuHeader
      label={label}
      options={NAME_MENU}
      value={mode}
      active={active}
      onChange={onChange}
      className={className}
      title={active ? `Sorted ${SORT_OPTIONS.find((o) => o.value === mode)?.label ?? ""}. Press to change.` : "Press to sort by name"}
    />
  );
}
