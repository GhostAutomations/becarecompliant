"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rescheduleBooking, completeBooking, cancelBooking } from "@/lib/planner/actions";
import { handleTimeFocus, handleTimeChange } from "./booking-form";
import type { PlannerBookingView } from "@/lib/planner/data";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function timeLabel(b: PlannerBookingView): string {
  const parts: string[] = [];
  if (b.startTime) parts.push(b.startTime);
  if (b.durationMinutes) parts.push(`${b.durationMinutes} min`);
  return parts.join(" · ");
}

function BookingCard({ b, todayIso }: { b: PlannerBookingView; todayIso: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rescheduling, setRescheduling] = useState(false);
  const overdue = b.status === "planned" && b.scheduledDate < todayIso;

  function run(fn: (fd: FormData) => Promise<{ ok?: string; error?: string }>, fd: FormData) {
    startTransition(async () => {
      const res = await fn(fd);
      if (res.error) alert(res.error);
      router.refresh();
    });
  }

  return (
    <div className="glass-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-white">{b.label}</p>
          <p className="text-sm text-white/60">
            {b.subjectName ?? "Ad-hoc"}{b.branchName ? ` · ${b.branchName}` : ""}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className={overdue ? "font-semibold text-red-300" : "text-white/80"}>
            {overdue ? "Overdue · " : ""}{fmtDate(b.scheduledDate)}
          </p>
          {timeLabel(b) ? <p className="text-xs text-white/50">{timeLabel(b)}</p> : null}
        </div>
      </div>

      {b.notes ? <p className="mt-2 text-sm text-white/60">{b.notes}</p> : null}

      {b.status === "planned" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {b.checkInstanceId && b.subjectId && b.population ? (
            // Linked to a check: completing the check auto-completes this booking,
            // so send the user to the check's form rather than marking it done here.
            <Link
              href={`/${b.population === "people" ? "people" : "service-users"}/${b.subjectId}/checks/${b.checkInstanceId}/complete`}
              className="btn-primary text-xs"
            >
              Complete check
            </Link>
          ) : (
            <form action={(fd) => run(completeBooking, fd)}>
              <input type="hidden" name="booking_id" value={b.id} />
              <button type="submit" disabled={pending} className="btn-primary text-xs">Mark done</button>
            </form>
          )}
          <button
            type="button"
            disabled={pending}
            className="btn-outline text-xs"
            onClick={() => setRescheduling((v) => !v)}
          >
            Reschedule
          </button>
          <form
            action={(fd) => {
              if (!confirm("Cancel this booking?")) return;
              run(cancelBooking, fd);
            }}
          >
            <input type="hidden" name="booking_id" value={b.id} />
            <button type="submit" disabled={pending} className="btn-outline text-xs text-red-300">Cancel</button>
          </form>
        </div>
      ) : (
        <p className="mt-2 text-xs uppercase tracking-wide text-white/40">{b.status}</p>
      )}

      {rescheduling ? (
        <form
          action={(fd) => { run(rescheduleBooking, fd); setRescheduling(false); }}
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-white/10 pt-3"
        >
          <input type="hidden" name="booking_id" value={b.id} />
          <label className="text-xs text-white/70">
            Date
            <input type="date" name="scheduled_date" defaultValue={b.scheduledDate} className="ml-2" required />
          </label>
          <label className="text-xs text-white/70">
            Time
            <input type="time" name="start_time" defaultValue={b.startTime ?? ""} className="ml-2" onFocus={handleTimeFocus} onChange={handleTimeChange} />
          </label>
          <label className="text-xs text-white/70">
            Min
            <input type="number" name="duration_minutes" min={5} step={5} defaultValue={b.durationMinutes ?? 30} className="ml-2 w-20" />
          </label>
          <button type="submit" disabled={pending} className="btn-primary text-xs">Save</button>
        </form>
      ) : null}
    </div>
  );
}

export default function MyPlannerList({
  bookings,
  todayIso,
}: {
  bookings: PlannerBookingView[];
  todayIso: string;
}) {
  const overdue = bookings.filter((b) => b.status === "planned" && b.scheduledDate < todayIso);
  const upcoming = bookings.filter((b) => b.status === "planned" && b.scheduledDate >= todayIso);
  const done = bookings.filter((b) => b.status !== "planned");

  if (bookings.length === 0) {
    return (
      <div className="glass-card px-6 py-12 text-center text-sm text-white/60">
        Nothing planned for you yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {overdue.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-red-300">Overdue</h2>
          {overdue.map((b) => <BookingCard key={b.id} b={b} todayIso={todayIso} />)}
        </section>
      ) : null}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white/80">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-white/50">Nothing coming up.</p>
        ) : (
          upcoming.map((b) => <BookingCard key={b.id} b={b} todayIso={todayIso} />)
        )}
      </section>
      {done.length > 0 ? (
        <details className="section-card">
          <summary>Completed and cancelled ({done.length})</summary>
          <div className="space-y-3 border-t border-white/10 p-4">
            {done.map((b) => <BookingCard key={b.id} b={b} todayIso={todayIso} />)}
          </div>
        </details>
      ) : null}
    </div>
  );
}
