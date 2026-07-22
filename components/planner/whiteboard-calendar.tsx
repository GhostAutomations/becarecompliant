"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PlannerBookingView } from "@/lib/planner/data";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (n: number) => String(n).padStart(2, "0");

function monthName(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shiftMonth(year: number, month: number, delta: number): string {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export default function WhiteboardCalendar({
  year,
  month,
  todayIso,
  bookings,
  branches,
  basePath = "/planner/whiteboard",
}: {
  year: number;
  month: number;
  todayIso: string;
  bookings: PlannerBookingView[];
  branches: Array<{ id: string; name: string }>;
  /** Where the month prev/next links point (so the calendar works on both pages). */
  basePath?: string;
}) {
  const [branchId, setBranchId] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const sep = basePath.includes("?") ? "&" : "?";
  const filtered = branchId ? bookings.filter((b) => b.branchId === branchId) : bookings;

  const byDay = useMemo(() => {
    const m = new Map<string, PlannerBookingView[]>();
    for (const b of filtered) {
      const arr = m.get(b.scheduledDate) ?? [];
      arr.push(b);
      m.set(b.scheduledDate, arr);
    }
    return m;
  }, [filtered]);

  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<{ day: number; iso: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, iso: `${year}-${pad(month)}-${pad(d)}` });

  const selectedList = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`${basePath}${sep}month=${shiftMonth(year, month, -1)}`} className="btn-ghost text-xs">‹ Prev</Link>
          <span className="min-w-[9rem] text-center text-sm font-semibold text-white">{monthName(year, month)}</span>
          <Link href={`${basePath}${sep}month=${shiftMonth(year, month, 1)}`} className="btn-ghost text-xs">Next ›</Link>
        </div>
        {branches.length > 1 ? (
          <label className="flex items-center gap-2 text-sm font-medium text-white/80">
            Branch
            <select className="inline-cell" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="grid grid-cols-7 gap-px rounded-xl bg-white/10 text-xs">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-slate-900/60 px-2 py-1.5 text-center font-semibold text-white/60">{w}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={`b${i}`} className="min-h-[92px] bg-slate-900/30" />;
          const items = byDay.get(cell.iso) ?? [];
          const isToday = cell.iso === todayIso;
          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => setSelectedDay(cell.iso)}
              className={`min-h-[92px] bg-slate-900/50 p-1.5 text-left align-top transition hover:bg-slate-800/60 ${isToday ? "ring-1 ring-inset ring-gold-400/60" : ""}`}
            >
              <span className={`block text-[11px] font-semibold ${isToday ? "text-gold-300" : "text-white/50"}`}>{cell.day}</span>
              <span className="mt-1 flex flex-col gap-0.5">
                {items.slice(0, 3).map((b) => (
                  <span key={b.id} className="group/appt relative block">
                    <span className="block truncate rounded bg-gold-400/15 px-1 py-0.5 text-[10px] text-gold-100">
                      {b.startTime ? `${b.startTime} ` : ""}{b.label}
                    </span>
                    <span className="pointer-events-none absolute left-0 top-full z-40 mt-1 hidden w-48 rounded-lg border border-white/15 bg-slate-900 p-2 text-left shadow-xl group-hover/appt:block">
                      <span className="block text-[11px] font-semibold text-white">{b.label}</span>
                      <span className="block text-[10px] text-white/70">
                        {b.subjectName ?? "Ad-hoc"}{b.branchName ? ` · ${b.branchName}` : ""}
                      </span>
                      <span className="block text-[10px] text-white/60">
                        {b.conductorName ?? "Unassigned"}{b.startTime ? ` · ${b.startTime}` : ""}{b.durationMinutes ? ` · ${b.durationMinutes} min` : ""}
                      </span>
                    </span>
                  </span>
                ))}
                {items.length > 3 ? (
                  <span className="text-[10px] text-white/50">+{items.length - 3} more</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {selectedDay ? (
        <div className="glass-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              {new Date(`${selectedDay}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
            </h3>
            <button type="button" className="text-xs text-white/50 hover:text-white" onClick={() => setSelectedDay(null)}>Close</button>
          </div>
          {selectedList.length === 0 ? (
            <p className="text-sm text-white/50">Nothing booked.</p>
          ) : (
            <div className="space-y-2">
              {selectedList.map((b) => (
                <div key={b.id} className="flex items-start justify-between gap-3 border-t border-white/10 pt-2 text-sm first:border-t-0 first:pt-0">
                  <div className="min-w-0">
                    <p className="font-medium text-white">{b.label}</p>
                    <p className="text-white/60">
                      {b.subjectName ?? "Ad-hoc"}{b.branchName ? ` · ${b.branchName}` : ""} · {b.conductorName ?? "Unassigned"}
                    </p>
                  </div>
                  <span className="shrink-0 text-white/70">{b.startTime ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
