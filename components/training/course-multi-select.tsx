"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TrainingCourse } from "@/lib/training/data";

/**
 * A dropdown that picks SEVERAL courses.
 *
 * WHY NOT A NATIVE <select multiple> (Phil asked for "still a drop down but also multi select",
 * 2026-08-01). A native one needs ctrl or cmd clicking to add a second choice, loses the whole
 * selection on a stray click, cannot be searched, and shows a fixed height list rather than
 * opening. With thirty three courses that is not usable on a trackpad. This reads as a dropdown
 * when closed and opens a searchable checklist, and a plain click adds rather than replaces.
 *
 * The chosen ids are submitted as repeated `course_ids` hidden inputs, so the form works exactly
 * as a select would and nothing depends on JSON.
 */
export default function CourseMultiSelect({
  courses,
  selected,
  onChange,
}: {
  courses: TrainingCourse[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  // Close on a click anywhere else, and on Escape, like a real dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === "" ? courses : courses.filter((c) => c.name.toLowerCase().includes(q));
  }, [courses, query]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const chosen = courses.filter((c) => selected.has(c.id));
  const label =
    chosen.length === 0
      ? "Choose courses"
      : chosen.length === 1
        ? chosen[0].name
        : `${chosen.length} courses`;

  return (
    <div ref={boxRef} className="relative">
      {/* The value the form posts. Repeated inputs, exactly as a multiple select would send. */}
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="course_ids" value={id} />
      ))}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="mt-1 flex w-full items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-left text-sm text-white/85 hover:border-white/25"
      >
        <span className={chosen.length === 0 ? "text-white/40" : ""}>{label}</span>
        <span className="shrink-0 text-white/40">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-10 mt-1 rounded-xl border border-white/15 bg-navy-900 shadow-2xl">
          <div className="border-b border-white/10 p-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses"
              className="w-full"
              autoFocus
              // This sits inside the record training form. Without this, pressing Enter after
              // typing a course name submits the whole thing before anyone has been ticked.
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {listed.length === 0 ? (
              <li className="px-3 py-2 text-sm text-white/50">No course matches that.</li>
            ) : (
              listed.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-white/5">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    <span className="text-white/85">{c.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-white/40">
                      {c.renewal_months ? `every ${c.renewal_months} months` : "one off"}
                    </span>
                  </label>
                </li>
              ))
            )}
          </ul>
          {chosen.length > 0 ? (
            <div className="flex items-center gap-3 border-t border-white/10 px-3 py-2">
              <span className="text-xs text-white/45">
                {chosen.length} chosen
              </span>
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="ml-auto text-xs text-white/55 underline hover:text-white/80"
              >
                Clear all
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
