"use client";

/**
 * Be Care Compliant: a column heading with the little gold arrow that opens a sort menu.
 *
 * ONE MENU FOR EVERY SORTABLE COLUMN. It started life as the Carer name sort (Phil, 2026-09-16)
 * and the Training register now sorts by any course as well (Phil, 2026-10-05), so the menu, its
 * look and its behaviour live here once. NameSortHeader is this with the four name orders.
 *
 * `active` is whether THIS column is the one the rows are ordered by. Only one column sorts at a
 * time: the arrow on every other heading goes quiet so it is obvious which one is in charge.
 *
 * The menu is rendered in a PORTAL, the same as PillSelect, because the header sits inside
 * the matrix's scrolling area and anything positioned normally would be clipped by it.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type SortMenuOption<V extends string> = { value: V; label: string; ascending: boolean };

export function SortMenuHeader<V extends string>({
  label,
  options,
  value,
  active = true,
  onChange,
  className,
  title,
  centre = true,
}: {
  label: ReactNode;
  /** Plain words for screen readers, when `label` is not plain text. */
  options: ReadonlyArray<SortMenuOption<V>>;
  /** The option this column is sorted by (or would be, when it is not the active column). */
  value: V;
  active?: boolean;
  onChange: (value: V) => void;
  className?: string;
  title?: string;
  centre?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);
  const plain = typeof label === "string" ? label : "This column";

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

  const sortedWords = active && current ? `sorted ${current.label}` : "not sorted";

  return (
    <th
      className={className}
      title={title}
      aria-sort={active && current ? (current.ascending ? "ascending" : "descending") : "none"}
    >
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        /* Centred by default, because .matrix th centres its heading. */
        className={`flex w-full cursor-pointer items-center gap-1.5 font-[inherit] text-[inherit] uppercase tracking-[inherit] text-white/70 transition hover:text-white ${
          centre ? "justify-center" : "justify-start"
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${plain}, ${sortedWords}. Press to change the order.`}
      >
        <span>{label}</span>
        <span
          aria-hidden
          className={`shrink-0 text-[0.65em] leading-none ${active ? "text-gold-400" : "text-white/30"}`}
        >
          {active && current && !current.ascending ? "▼" : "▲"}
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
            {options.map((o) => {
              const on = active && o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  onClick={() => {
                    setOpen(false);
                    onChange(o.value);
                  }}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-left text-xs font-semibold normal-case tracking-normal transition ${
                    on ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </th>
  );
}
