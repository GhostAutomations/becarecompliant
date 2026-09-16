"use client";

/**
 * Be Care Compliant — the sortable name column every register shares.
 *
 * Phil, 2026-09-16: "in the carer column we have the names, we need a way to order them,
 * this needs to be the same for all matrix, on su and training."
 *
 * ONE COMPONENT FOR THE THREE REGISTERS, because a sort that behaves differently on People,
 * Service Users and Training is three things to learn instead of one. The header is a
 * button: press it to flip A to Z and back, and the arrow says which way it is.
 *
 * A to Z is the default and the server already returns rows that way (every register orders
 * by surname_key), so a register looks the same on arrival as it always has. The sort is a
 * question you ask while you are looking, not a way you work, so it is not remembered: come
 * back tomorrow and you are on A to Z again.
 *
 * SORTED BY SURNAME, not by the name as written. "Bethan Hughes" files under H, which is
 * what a manager scanning forty carers is looking for, and it is the same tested rule
 * (lib/people/name-sort) the database orders by, so pressing the header twice returns you to
 * exactly the order you started in.
 */

import { useState } from "react";
import { bySurname } from "@/lib/people/name-sort";

export type SortDir = "asc" | "desc";

export function useNameSort(initial: SortDir = "asc") {
  const [dir, setDir] = useState<SortDir>(initial);
  return { dir, toggle: () => setDir((d) => (d === "asc" ? "desc" : "asc")) };
}

/** Order rows by surname, A to Z or Z to A. Never mutates the list it is given. */
export function sortByName<T>(
  items: readonly T[],
  nameOf: (item: T) => unknown,
  dir: SortDir,
): T[] {
  const asc = bySurname(items, nameOf);
  return dir === "asc" ? asc : asc.reverse();
}

export function NameSortHeader({
  label,
  dir,
  onToggle,
  className = "col-carer",
}: {
  label: string;
  dir: SortDir;
  onToggle: () => void;
  className?: string;
}) {
  const next = dir === "asc" ? "Z to A" : "A to Z";
  return (
    <th className={className} aria-sort={dir === "asc" ? "ascending" : "descending"}>
      <button
        type="button"
        onClick={onToggle}
        /* Inherits the header's own type and weight: this is the column heading, which
           happens to be pressable, not a button that has been dropped into a heading. */
        /* Centred, because .matrix th.col-carer centres its heading while the names below
           stay left aligned. The button must not quietly change that. */
        className="flex w-full items-center justify-center gap-1.5 font-[inherit] text-[inherit] uppercase tracking-[inherit] text-white/70 transition hover:text-white"
        title={`Sort ${next}`}
        aria-label={`${label}, sorted ${dir === "asc" ? "A to Z" : "Z to A"}. Press to sort ${next}.`}
      >
        {label}
        <span aria-hidden className="text-[0.65em] leading-none text-gold-400">
          {dir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}
