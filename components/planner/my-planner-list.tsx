"use client";

import { ukShortDateWithWeekday } from "@/lib/dates";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rescheduleBooking, completeBooking, cancelBooking } from "@/lib/planner/actions";
import TimeSelect from "./time-select";
import type { PlannerBookingView } from "@/lib/planner/data";

function fmtDate(iso: string): string {
  // See lib/dates.ts: the toggle used to change the spelling of September between views.
  return ukShortDateWithWeekday(iso);
}

function timeLabel(b: PlannerBookingView): string {
  const parts: string[] = [];
  if (b.startTime) parts.push(b.startTime);
  if (b.durationMinutes) parts.push(`${b.durationMinutes} min`);
  return parts.join(" · ");
}

/**
 * ONE OVERDUE JOB, ON ONE LINE (Phil, 2026-08-16: "way too big, needs to be simpler and smaller").
 *
 * This was a full card per booking, with the task in a heading, the name under it, the date in
 * its own column and three buttons on a row of their own. Two overdue jobs filled half the
 * screen and pushed the calendar below the fold, which is the wrong way round: the band is a
 * prompt, not the page.
 *
 * The name leads, as it does on the calendar chip, because it is the thing that answers "where
 * am I going". Everything that was implied is dropped: these are all overdue, so nothing says
 * "Overdue" on each row, and they are all planned, so there is no status line.
 */
function BookingCard({ b }: { b: PlannerBookingView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rescheduling, setRescheduling] = useState(false);

  function run(fn: (fd: FormData) => Promise<{ ok?: string; error?: string }>, fd: FormData) {
    startTransition(async () => {
      const res = await fn(fd);
      if (res.error) alert(res.error);
      router.refresh();
    });
  }

  const btn = "px-2.5 py-1 text-[11px]";

  return (
    <div className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium text-white">{b.subjectName ?? b.label}</span>
          {b.subjectName ? <span className="text-white/45"> · {b.label}</span> : null}
          {b.branchName ? <span className="text-white/35"> · {b.branchName}</span> : null}
        </span>
        <span className="shrink-0 text-xs text-red-300">
          {fmtDate(b.scheduledDate)}
          {timeLabel(b) ? <span className="text-white/40"> · {timeLabel(b)}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {b.checkInstanceId && b.subjectId && b.population ? (
            // Linked to a check: completing the check auto-completes this booking, so send the
            // user to the check's form rather than marking it done here.
            <Link
              href={`/${b.population === "people" ? "people" : "service-users"}/${b.subjectId}/checks/${b.checkInstanceId}/complete`}
              className={`btn-primary ${btn}`}
            >
              Complete
            </Link>
          ) : (
            <form action={(fd) => run(completeBooking, fd)}>
              <input type="hidden" name="booking_id" value={b.id} />
              <button type="submit" disabled={pending} className={`btn-primary ${btn}`}>Done</button>
            </form>
          )}
          <button
            type="button"
            disabled={pending}
            className={`btn-outline ${btn}`}
            onClick={() => setRescheduling((v) => !v)}
          >
            Move
          </button>
          <form
            action={(fd) => {
              if (!confirm("Cancel this booking?")) return;
              run(cancelBooking, fd);
            }}
          >
            <input type="hidden" name="booking_id" value={b.id} />
            <button type="submit" disabled={pending} className={`btn-outline ${btn} text-red-300`}>Cancel</button>
          </form>
        </span>
      </div>

      {b.notes ? <p className="mt-1 truncate text-xs text-white/45">{b.notes}</p> : null}

      {rescheduling ? (
        <form
          action={(fd) => { run(rescheduleBooking, fd); setRescheduling(false); }}
          className="mt-2 flex flex-wrap items-end gap-2 border-t border-white/10 pt-2"
        >
          <input type="hidden" name="booking_id" value={b.id} />
          <label className="text-xs text-white/70">
            Date
            <input type="date" name="scheduled_date" defaultValue={b.scheduledDate} className="ml-2" required />
          </label>
          <label className="text-xs text-white/70">
            Time
            <span className="mt-1 block"><TimeSelect defaultValue={b.startTime ?? undefined} /></span>
          </label>
          <label className="text-xs text-white/70">
            Min
            <input type="number" name="duration_minutes" min={5} step={5} defaultValue={b.durationMinutes ?? 30} className="ml-2 w-20" />
          </label>
          <button type="submit" disabled={pending} className={`btn-primary ${btn}`}>Save</button>
        </form>
      ) : null}
    </div>
  );
}

/**
 * ANYTHING OVERDUE, ABOVE THE CALENDAR.
 *
 * This was a whole List view behind a toggle, and Phil scrapped it on 2026-08-15. Scrapping it
 * outright would have lost two things worth keeping, so they moved here instead:
 *
 *   - A job planned for last month is not on this month's grid, so a calendar on its own is
 *     exactly where an overdue task goes to be forgotten. This band is always visible and does
 *     not depend on which week you happen to be looking at.
 *   - Complete check, Reschedule and Cancel lived only in the list. They come with it.
 *
 * Renders NOTHING when there is nothing overdue, which is the normal state and the point: it is
 * a band that appears when something needs doing, not another empty panel to scroll past.
 */
export default function OverdueBookings({
  bookings,
  todayIso,
}: {
  bookings: PlannerBookingView[];
  todayIso: string;
}) {
  const overdue = bookings.filter((b) => b.status === "planned" && b.scheduledDate < todayIso);
  if (overdue.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-red-300">
        Overdue ({overdue.length})
      </h2>
      <div className="glass-card divide-y divide-white/10">
        {overdue.map((b) => <BookingCard key={b.id} b={b} />)}
      </div>
    </section>
  );
}
