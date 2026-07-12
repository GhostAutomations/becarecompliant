"use client";

/**
 * Be Care Compliant — Book a formal absence management meeting (Phase 6).
 * Booking is the invitation step: stage, date, time and duration, then the
 * employee and their line manager receive the formal letter email with a timed
 * .ics invite. Recording the meeting afterwards (Record meeting) attaches the
 * Evidence to this booking. Solid primary submit with a visible Booking… state
 * (standing rules).
 */

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import { bookAbsenceMeeting } from "@/lib/absence/actions";

/** Earliest bookable date for the picker: 48 hours from now (server enforces
 *  the exact date + time cutoff). */
function minNoticeDate(): string {
  return new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const DURATIONS = [
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1 hour 30" },
  { value: 120, label: "2 hours" },
];

export default function BookMeetingDialog({
  personId,
  personName,
  defaultStage,
}: {
  personId: string;
  personName: string;
  /** Suggested stage from the card's derived position, clamped 1 to 4. */
  defaultStage: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(bookAbsenceMeeting, IDLE_STATE);

  // Close on success and refresh the register (booked meetings advance the stage).
  useEffect(() => {
    if (state.ok && open) {
      router.refresh();
      const t = setTimeout(() => setOpen(false), 1200);
      return () => clearTimeout(t);
    }
  }, [state.ok, open, router]);

  return (
    <>
      <button
        type="button"
        className="btn-outline px-3 py-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        Book meeting
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-navy-900 p-5 shadow-2xl">
              <h2 className="text-sm font-semibold text-white">
                Book meeting: {personName}
              </h2>
              <p className="mt-1 text-xs text-white/50">
                The employee and their line manager receive a formal letter
                invitation with a calendar invite.
              </p>
              <form action={action} className="mt-4 space-y-3">
                <input type="hidden" name="person_id" value={personId} />
                <div>
                  <label htmlFor="bm-stage" className="form-label">Stage</label>
                  <select id="bm-stage" name="stage" defaultValue={String(defaultStage)} disabled={pending}>
                    {[1, 2, 3, 4].map((s) => (
                      <option key={s} value={s}>Stage {s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="bm-date" className="form-label">Date</label>
                  <input
                    id="bm-date"
                    name="meeting_date"
                    type="date"
                    min={minNoticeDate()}
                    required
                    disabled={pending}
                  />
                  <p className="mt-1 text-[10px] text-white/40">
                    Formal meetings need at least 48 hours notice.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="bm-time" className="form-label">Time</label>
                    <input id="bm-time" name="meeting_time" type="time" defaultValue="10:00" required disabled={pending} />
                  </div>
                  <div>
                    <label htmlFor="bm-duration" className="form-label">Duration</label>
                    <select id="bm-duration" name="duration" defaultValue="60" disabled={pending}>
                      {DURATIONS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {state.error && <p className="form-error">{state.error}</p>}
                {state.ok && <p className="text-sm text-emerald-300">{state.ok}</p>}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button type="submit" className="btn-primary text-xs" disabled={pending}>
                    {pending ? "Booking…" : "Book and send invitations"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    disabled={pending}
                    onClick={() => setOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
