"use client";

/**
 * Be Care Compliant — Cancel / rearrange a booked absence meeting in ONE
 * popup (Phil, 2026-07-12), mirroring the Book meeting box. Rearranging picks
 * a new slot, location and conductor and sends fresh formal letters marked as
 * replacing the earlier invitation; cancelling deletes the booking and emails
 * both invitees that it is off. Remounts per open so state is always clean.
 */

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import {
  rearrangeAbsenceMeeting,
  cancelAbsenceMeetingBooking,
} from "@/lib/absence/actions";
import type { ConductorLite, OpenBookingRow, MeetingOffice } from "@/lib/absence/data";

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

export default function CancelRearrangeDialog({
  booking,
  personName,
  conductors,
  offices,
}: {
  booking: OpenBookingRow;
  personName: string;
  conductors: ConductorLite[];
  offices: MeetingOffice[];
}) {
  const [openInstance, setOpenInstance] = useState(0);

  return (
    <>
      <button
        type="button"
        className="btn-outline px-3 py-1.5 text-xs"
        onClick={() => setOpenInstance((n) => n + 1)}
      >
        Cancel / rearrange
      </button>
      {openInstance > 0 &&
        createPortal(
          <CancelRearrangeForm
            key={openInstance}
            booking={booking}
            personName={personName}
            conductors={conductors}
            offices={offices}
            onClose={() => setOpenInstance(0)}
          />,
          document.body,
        )}
    </>
  );
}

function CancelRearrangeForm({
  booking,
  personName,
  conductors,
  offices,
  onClose,
}: {
  booking: OpenBookingRow;
  personName: string;
  conductors: ConductorLite[];
  offices: MeetingOffice[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [rearrangeState, rearrangeAction, rearranging] = useActionState(
    rearrangeAbsenceMeeting,
    IDLE_STATE,
  );
  const [cancelState, cancelAction, cancelling] = useActionState(
    cancelAbsenceMeetingBooking,
    IDLE_STATE,
  );
  const busy = rearranging || cancelling;

  // Cancel closes IMMEDIATELY on success (a lingering disabled dialog reads as
  // an error: Phil, 2026-07-12). Rearrange holds briefly so the confirmation
  // message is seen, then closes.
  useEffect(() => {
    if (cancelState.ok) {
      router.refresh();
      onClose();
    }
  }, [cancelState.ok, router, onClose]);

  useEffect(() => {
    if (rearrangeState.ok) {
      router.refresh();
      const t = setTimeout(onClose, 1200);
      return () => clearTimeout(t);
    }
  }, [rearrangeState.ok, router, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-navy-900 p-5 shadow-2xl">
        <h2 className="text-sm font-semibold text-white">
          Cancel or rearrange: {personName}
        </h2>
        <p className="mt-1 text-xs text-white/50">
          Rearranging sends fresh invitations that replace the earlier ones.
          Cancelling tells both invitees the meeting is off.
        </p>

        <form action={rearrangeAction} className="mt-4 space-y-3">
          <input type="hidden" name="meeting_id" value={booking.id} />
          <div>
            <label htmlFor="cr-conductor" className="form-label">Who is holding the meeting</label>
            <select
              id="cr-conductor"
              name="conducted_by"
              defaultValue={booking.conductor_id ?? ""}
              required
              disabled={busy}
            >
              <option value="" disabled>Choose a Manager or Admin</option>
              {conductors.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.full_name || c.email) + (c.role === "company_admin" ? " (Admin)" : " (Manager)")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cr-date" className="form-label">New date</label>
            <input
              id="cr-date"
              name="meeting_date"
              type="date"
              min={minNoticeDate()}
              defaultValue={booking.meeting_date ?? ""}
              required
              disabled={busy}
            />
            <p className="mt-1 text-[10px] text-white/40">
              Formal meetings need at least 48 hours notice.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="cr-time" className="form-label">Time</label>
              <input
                id="cr-time"
                name="meeting_time"
                type="time"
                defaultValue={(booking.meeting_time ?? "10:00").slice(0, 5)}
                required
                disabled={busy}
              />
            </div>
            <div>
              <label htmlFor="cr-duration" className="form-label">Duration</label>
              <select
                id="cr-duration"
                name="duration"
                defaultValue={String(booking.duration_minutes ?? 60)}
                disabled={busy}
              >
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="cr-location" className="form-label">Location</label>
            <select
              id="cr-location"
              name="location_choice"
              defaultValue={
                booking.location === "Microsoft Teams"
                  ? "teams"
                  : offices.find((o) => o.address && o.address === booking.location)?.id ?? ""
              }
              required
              disabled={busy}
            >
              <option value="" disabled>Choose a location</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id} disabled={!o.hasAddress}>
                  {o.label}{o.hasAddress ? "" : " (no address set)"}
                </option>
              ))}
              <option value="teams">Teams</option>
            </select>
          </div>
          {rearrangeState.error && <p className="form-error">{rearrangeState.error}</p>}
          {rearrangeState.ok && <p className="text-sm text-emerald-300">{rearrangeState.ok}</p>}
          <button type="submit" className="btn-primary text-xs" disabled={busy}>
            {rearranging ? "Rearranging…" : "Rearrange and send new invitations"}
          </button>
        </form>

        <div className="mt-4 border-t border-white/10 pt-4">
          <form
            action={cancelAction}
            onSubmit={(e) => {
              if (!window.confirm("Cancel this meeting? The invitees will be emailed that it is off.")) {
                e.preventDefault();
              }
            }}
            className="flex items-center justify-between gap-2"
          >
            <input type="hidden" name="meeting_id" value={booking.id} />
            <button type="submit" className="btn-outline text-xs" disabled={busy}>
              {cancelling ? "Cancelling…" : "Cancel the meeting"}
            </button>
            <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={onClose}>
              Close
            </button>
          </form>
          {cancelState.error && <p className="form-error mt-2">{cancelState.error}</p>}
          {cancelState.ok && <p className="mt-2 text-sm text-emerald-300">{cancelState.ok}</p>}
        </div>
      </div>
    </div>
  );
}
