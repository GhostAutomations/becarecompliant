"use client";

/**
 * Be Care Compliant — the one type-ahead for picking a record by name.
 *
 * WHY IT IS SHARED (Phil, 2026-09-17, of the complaint form): "lets have that box where we type
 * the carers name and they appear, we built a field like the previosly, i cant remember if it is
 * for people or service users". He was remembering the form lookup field, and the answer to "we
 * already built this" is to use the same control rather than build a second one that drifts. The
 * matching rule comes from lib/forms/lookup.ts, which is pure and unit tested, so a name typed
 * here finds exactly what the same name finds on a Spot Check form: accents, apostrophes and all.
 *
 * Keyboard first: down/up move, Enter picks, Escape closes.
 *
 * The list is rendered into the body and positioned over the page, because these fields sit
 * inside .section-card, which is overflow:hidden -- in flow, a list longer than the gap to the
 * card's edge is cut off and the matches below the fold cannot be seen or clicked.
 *
 * It holds no answer of its own. What a pick MEANS -- one linked record, or another chip on a
 * list -- belongs to the caller, which is what lets one control serve both.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { filterChoices, type LookupChoice } from "@/lib/forms/lookup";

export default function RecordTypeahead({
  id,
  query,
  choices,
  onQueryChange,
  onChoose,
  onOpenChange,
  disabled = false,
  placeholder = "Start typing a name",
  noMatchText = "No record matches that. Add the record first.",
}: {
  id?: string;
  /** Controlled: the caller owns the text, because only the caller knows what a pick did to it. */
  query: string;
  choices: readonly LookupChoice[];
  onQueryChange: (next: string) => void;
  onChoose: (choice: LookupChoice) => void;
  /** Told when the list opens and closes, so a caller can hold back a "not on the list" message
   *  until the person has stopped looking at the list. */
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  noMatchText?: string;
}) {
  const [open, setOpenState] = useState(false);
  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  const [active, setActive] = useState(0);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  // The list follows what is typed, never the other way round.
  const shown = useMemo(() => filterChoices(choices, query), [choices, query]);

  const place = useCallback(() => {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  const show = useCallback(() => {
    place();
    setOpen(true);
  }, [place, setOpen]);

  // Clicking away closes the list. Without this the list can sit over the next field.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onScroll() {
      place();
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place, setOpen]);

  function choose(choice: LookupChoice) {
    setOpen(false);
    onChoose(choice);
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setActive(0);
          show();
        }}
        onFocus={() => show()}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            show();
            setActive((i) => Math.min(i + 1, Math.max(shown.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && open && shown[active]) {
            e.preventDefault();
            choose(shown[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />

      {open && shown.length > 0
        ? createPortal(
            <ul
              ref={menuRef}
              role="listbox"
              className="z-50 max-h-64 overflow-auto rounded-xl border border-white/15 bg-navy-900 py-1 shadow-2xl"
              style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width }}
            >
              {shown.map((c, i) => (
                <li key={c.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(c)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-baseline justify-between gap-3 px-3.5 py-2 text-left text-sm ${
                      i === active ? "bg-white/10 text-white" : "text-white/80"
                    }`}
                  >
                    <span>{c.label}</span>
                    {c.hint ? <span className="text-xs text-white/45">{c.hint}</span> : null}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}

      {open && query.trim() !== "" && shown.length === 0 ? (
        <p className="form-hint">{noMatchText}</p>
      ) : null}
    </div>
  );
}
