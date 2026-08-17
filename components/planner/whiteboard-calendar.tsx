"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PlannerBookingView } from "@/lib/planner/data";
// Pure and tested in lib/planner/week.test.ts: month ends, year ends, leap days and the clocks
// going back are exactly where week arithmetic quietly goes wrong.
import { mondayOf, shiftWeek, weekLabel, weekDays } from "@/lib/planner/week";

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

/**
 * WHAT A CHIP SAYS (Phil, 2026-08-15): "if it showed the name, the person would know where they
 * are going with a quick glance".
 *
 * It used to read the time and the check kind, so a week of work said "10:00 Supervision,
 * 14:00 Supervision, 09:00 Spot Check" and told a manager nothing about where to drive. The NAME
 * is the thing that answers the question, so it leads. The kind is still on the tooltip, and on
 * its own line in the week view where there is room for it.
 */
function chipName(b: PlannerBookingView): string {
  // label is already the ad-hoc TITLE when there is no subject, so an ad-hoc task keeps saying
  // what it is rather than falling back to a word nobody typed.
  return b.subjectName ?? b.label;
}

export default function WhiteboardCalendar({
  span = "month",
  year,
  month,
  weekStartIso,
  todayIso,
  bookings,
  branches,
  basePath = "/planner/whiteboard",
}: {
  /** A month grid, or one week across. ONE component on purpose: the chip, the tooltip and the
   *  day panel are the same in both, and two copies would drift the first time either changed. */
  span?: "month" | "week";
  year: number;
  month: number;
  /** The Monday of the week being shown. Only read when span is "week". */
  weekStartIso?: string;
  todayIso: string;
  bookings: PlannerBookingView[];
  branches: Array<{ id: string; name: string }>;
  /** Where the prev/next links point (so the calendar works on both pages). */
  basePath?: string;
  /**
   * Name the person carrying each task out.
   *
   * ON THE WHITEBOARD, NOT ON MY PLANNER (Phil, 2026-08-16). The whiteboard is everybody's work
   * on one grid, so "who is doing this" is half the question. My Planner is only ever your own
   * bookings, where printing your own name on every chip is noise in the space the task needs.
   */
}) {
  const isWeek = span === "week";
  const [branchId, setBranchId] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const sep = basePath.includes("?") ? "&" : "?";
  // Only planned bookings belong on the calendar; completed and cancelled ones drop off.
  const filtered = bookings.filter((b) => b.status === "planned" && (!branchId || b.branchId === branchId));

  const byDay = useMemo(() => {
    const m = new Map<string, PlannerBookingView[]>();
    for (const b of filtered) {
      const arr = m.get(b.scheduledDate) ?? [];
      arr.push(b);
      m.set(b.scheduledDate, arr);
    }
    return m;
  }, [filtered]);

  const monday = mondayOf(weekStartIso ?? todayIso);
  const cells: Array<{ day: number; iso: string } | null> = [];
  if (isWeek) {
    for (const iso of weekDays(monday)) cells.push({ day: Number(iso.slice(8, 10)), iso });
  } else {
    const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, iso: `${year}-${pad(month)}-${pad(d)}` });
  }
  // A week shows everything; a month cell is too short to, so it caps and says how many are left.
  const perCell = isWeek ? 99 : 2;

  const selectedList = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={isWeek ? `${basePath}${sep}week=${shiftWeek(monday, -1)}` : `${basePath}${sep}month=${shiftMonth(year, month, -1)}`}
            className="btn-ghost text-xs"
          >
            ‹ Prev
          </Link>
          <span className="min-w-[9rem] text-center text-sm font-semibold text-white">
            {isWeek ? weekLabel(monday) : monthName(year, month)}
          </span>
          <Link
            href={isWeek ? `${basePath}${sep}week=${shiftWeek(monday, 1)}` : `${basePath}${sep}month=${shiftMonth(year, month, 1)}`}
            className="btn-ghost text-xs"
          >
            Next ›
          </Link>
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
        {/*
          A WEEK HEADING CARRIES ITS DATE (Phil, 2026-08-16: "why isn't the date next to the day?").
          A month grid repeats the same seven names down six rows, so the date belongs in the
          cell; a week has one row, so "Mon 10" is the heading and the cell keeps its space for
          the work. Today's column is marked in the heading too, which is where the eye lands.
        */}
        {(isWeek ? cells : WEEKDAYS.map((w) => ({ label: w, iso: null }))).map((h, i) => {
          const cell = isWeek ? (h as { day: number; iso: string }) : null;
          const isToday = !!cell && cell.iso === todayIso;
          return (
            <div
              key={cell ? cell.iso : (h as { label: string }).label}
              className={`bg-slate-900/60 px-2 py-1.5 text-center font-semibold ${isToday ? "text-gold-300" : "text-white/60"}`}
            >
              {cell ? `${WEEKDAYS[i]} ${cell.day}` : (h as { label: string }).label}
            </div>
          );
        })}
        {cells.map((cell, i) => {
          if (!cell) return <div key={`b${i}`} className="min-h-[92px] bg-slate-900/30" />;
          const items = byDay.get(cell.iso) ?? [];
          const isToday = cell.iso === todayIso;
          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => setSelectedDay(cell.iso)}
              /* flex-col + justify-start because a BUTTON centres its content vertically. In a
                 112px month cell that was invisible; in a 320px week cell the appointments
                 floated in the middle of the day with empty space above them. */
              className={`flex flex-col justify-start ${isWeek ? "min-h-[320px]" : "min-h-[112px]"} bg-slate-900/50 p-1.5 text-left align-top transition hover:bg-slate-800/60 ${isToday ? "ring-1 ring-inset ring-gold-400/60" : ""}`}
            >
              {isWeek ? null : (
                <span className={`block text-[11px] font-semibold ${isToday ? "text-gold-300" : "text-white/50"}`}>{cell.day}</span>
              )}
              <span className="mt-1 flex flex-col gap-0.5">
                {items.slice(0, perCell).map((b) => (
                  <span key={b.id} className="group/appt relative block">
                    {/*
                      ONE APPOINTMENT IS ONE CHIP (Phil, 2026-08-16: "why is the task and location
                      out of the chip?"). The second line used to sit outside the coloured
                      background, so a booking read as a chip with a loose caption trailing off
                      it, and two of them in a day looked like four things. Both lines are inside
                      the same block now.

                      THE NAME LEADS: a column of "10:00 Supervision" told a manager nothing
                      about where she was going. The task and the branch follow, because knowing
                      where you are going without knowing what for sends somebody out unprepared.
                    */}
                    <span className="block rounded bg-gold-400/15 px-1 py-0.5 text-[10px] text-gold-100">
                      <span className="block truncate">
                        {b.startTime ? `${b.startTime} ` : ""}{chipName(b)}
                      </span>
                      {(() => {
                        /*
                         * The second line, built from whatever is worth saying and nothing that
                         * is not. The task is skipped on an ad-hoc booking because the first
                         * line IS the task; the conductor only on the whiteboard, where the grid
                         * is everybody's; the branch only in the week, where there is room.
                         */
                        const parts = [
                          /*
                           * THE CONDUCTOR COMES FIRST. This grid is the whole company's work, so
                           * who is carrying the task out is half the question, and it was last
                           * on the line, which is what the truncation ate in a month cell:
                           * "Care Plan Review · Akra…" reads as a broken name rather than a
                           * name. It survives the squeeze now and the task gives way instead.
                           *
                           * NEVER "Unassigned". A booking cannot exist without a conductor (the
                           * column is NOT NULL), so a missing name is a name that could not be
                           * read, and saying nothing beats saying something untrue.
                           */
                          b.conductorName,
                          b.subjectName ? b.label : null,
                          isWeek ? b.branchName : null,
                        ].filter(Boolean);
                        return parts.length > 0 ? (
                          <span className="block truncate text-gold-100/60">{parts.join(" · ")}</span>
                        ) : null;
                      })()}
                    </span>
                    <span className="pointer-events-none absolute left-0 top-full z-40 mt-1 hidden w-48 rounded-lg border border-white/15 bg-slate-900 p-2 text-left shadow-xl group-hover/appt:block">
                      <span className="block text-[11px] font-semibold text-white">{b.label}</span>
                      <span className="block text-[10px] text-white/70">
                        {b.subjectName ?? "Ad-hoc"}{b.branchName ? ` · ${b.branchName}` : ""}
                      </span>
                      <span className="block text-[10px] text-white/60">
                        {[b.conductorName, b.startTime, b.durationMinutes ? `${b.durationMinutes} min` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </span>
                ))}
                {items.length > perCell ? (
                  <span className="text-[10px] text-white/50">+{items.length - perCell} more</span>
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
                      {[b.subjectName, b.branchName, b.conductorName].filter(Boolean).join(" · ")}
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
