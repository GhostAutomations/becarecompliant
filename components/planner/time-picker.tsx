"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A white two-column time picker in the style of the native time field, but with
 * restricted values: left column hours 8am to 8pm, right column minutes
 * 00/15/30/45. Writes 24h HH:MM to a hidden input so it posts like any field.
 */

const HOURS = Array.from({ length: 13 }, (_, i) => 8 + i); // 8..20
const MINUTES = ["00", "15", "30", "45"];
const pad2 = (n: number) => String(n).padStart(2, "0");

function hourLabel(h: number): string {
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}${h < 12 ? "am" : "pm"}`;
}
function displayLabel(hhmm: string): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${pad2(m)} ${h < 12 ? "am" : "pm"}`;
}

export default function TimePicker({
  name,
  defaultValue = "",
  className = "",
}: {
  name: string;
  defaultValue?: string;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selHour = value ? value.split(":")[0] : "";
  const selMin = value ? value.split(":")[1] : "";

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800"
      >
        <span className={value ? "" : "text-slate-400"}>{value ? displayLabel(value) : "Select time"}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-slate-500" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="max-h-52 w-24 overflow-y-auto border-r border-slate-100">
            {HOURS.map((h) => {
              const hh = pad2(h);
              return (
                <button
                  type="button"
                  key={h}
                  onClick={() => setValue(`${hh}:${selMin || "00"}`)}
                  className={`block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 ${selHour === hh ? "bg-slate-200 font-semibold" : ""}`}
                >
                  {hourLabel(h)}
                </button>
              );
            })}
          </div>
          <div className="max-h-52 w-16 overflow-y-auto">
            {MINUTES.map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setValue(`${selHour || "08"}:${m}`)}
                className={`block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 ${selMin === m ? "bg-slate-200 font-semibold" : ""}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
