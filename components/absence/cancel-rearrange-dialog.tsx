"use client";

/**
 * Be Care Compliant — Cancel / rearrange a booked absence meeting in ONE
 * popup (Phil, 2026-07-12), mirroring the Book meeting box. Rearranging picks
 * a new slot, location and conductor and sends fresh formal letters marked as
 * replacing the earlier invitation; cancelling deletes the booking and emails
 * both invitees that it is off. Remounts per open so state is always clean.
 *
 * Both show their emails read only for approval first (Phil, 2026-09-29):
 * nothing is changed, cancelled or sent until Approve and send. The letters
 * step is also the "are you sure" for cancelling. The rearrange form stays
 * mounted (hidden) behind the letters so Back keeps every choice.
 */

import { startTransition, useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ROLE_LABELS } from "@/lib/nav";
import { useRouter } from "next/navigation";
import { IDLE_STATE } from "@/lib/forms";
import {
  rearrangeAbsenceMeeting,
  cancelAbsenceMeetingBooking,
  previewRearrangeAbsenceMeeting,
  previewCancelAbsenceMeeting,
} from "@/lib/absence/actions";
import type { LetterPreview } from "@/lib/absence/letter-preview";
import LetterPreviewPanel from "@/components/absence/letter-preview-panel";
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
  /*
   * Stable on purpose. The form's success effect lists onClose and calls router.refresh(); the
   * refresh re-renders this component, so an inline arrow gave a new onClose every time, which re
   * ran the effect, which refreshed again: an endless refresh loop that kept the box open and hit
   * the server until it answered 503 (found live 2026-09-29).
   */
  const close = useCallback(() => setOpenInstance(0), []);

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
            onClose={close}
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
  /*
   * Cancelling asks first, IN THE APP: the cancellation notices are shown and nothing happens
   * until Approve and send. It once called window.confirm, which cannot be styled, reads as a
   * browser warning rather than as the product, and freezes browser automation dead.
   */
  const [cancelState, cancelAction, cancelling] = useActionState(
    cancelAbsenceMeetingBooking,
    IDLE_STATE,
  );
  const [shown, setShown] = useState<{ kind: "rearrange" | "cancel"; letters: LetterPreview[] } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  /** Exactly the details the letters were built from; Approve and send posts these. */
  const approved = useRef<FormData | null>(null);
  const busy = rearranging || cancelling || previewing;

  function showLetters(kind: "rearrange" | "cancel", fd: FormData) {
    setPreviewError(null);
    startPreview(async () => {
      const result =
        kind === "rearrange"
          ? await previewRearrangeAbsenceMeeting(fd)
          : await previewCancelAbsenceMeeting(fd);
      if (result.letters) {
        approved.current = fd;
        setShown({ kind, letters: result.letters });
      } else {
        approved.current = null;
        setPreviewError(result.error ?? "The letters could not be prepared.");
      }
    });
  }

  function approveAndSend() {
    const fd = approved.current;
    if (!fd || !shown) return;
    startTransition(() => (shown.kind === "rearrange" ? rearrangeAction(fd) : cancelAction(fd)));
  }

  function cancelMeeting() {
    const fd = new FormData();
    fd.set("meeting_id", booking.id);
    showLetters("cancel", fd);
  }

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
      <div
        className={`max-h-[94vh] w-full overflow-y-auto rounded-2xl border border-white/15 bg-navy-900 p-5 shadow-2xl ${
          shown ? "max-w-2xl" : "max-w-sm"
        }`}
      >
        <h2 className="text-sm font-semibold text-white">
          {shown ? "Check the letters" : "Cancel or rearrange"}: {personName}
        </h2>
        {shown ? (
          <LetterPreviewPanel
            letters={shown.letters}
            intro={
              shown.kind === "rearrange"
                ? "These are the new invitations that will be sent. Nothing is changed or sent until you approve."
                : "Approving cancels the meeting and sends these notices. Nothing happens until you approve."
            }
            approveLabel="Approve and send"
            workingLabel="Sending…"
            pending={shown.kind === "rearrange" ? rearranging : cancelling}
            error={shown.kind === "rearrange" ? rearrangeState.error : cancelState.error}
            ok={shown.kind === "rearrange" ? rearrangeState.ok : cancelState.ok}
            onBack={() => setShown(null)}
            onApprove={approveAndSend}
            onClose={onClose}
          />
        ) : (
          <p className="mt-1 text-xs text-white/50">
            Rearranging sends fresh invitations that replace the earlier ones.
            Cancelling tells both invitees the meeting is off. You will see the
            emails before anything is sent.
          </p>
        )}

        <div className={shown ? "hidden" : undefined}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            showLetters("rearrange", new FormData(e.currentTarget));
          }}
          className="mt-4 space-y-3"
        >
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
              <option value="" disabled>Choose who is holding it</option>
              {conductors.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.full_name || c.email) + (ROLE_LABELS[c.role] ? ` (${ROLE_LABELS[c.role]})` : "")}
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
          <button type="submit" className="btn-primary text-xs" disabled={busy}>
            {previewing ? "Preparing letters…" : "Rearrange: check the letters"}
          </button>
        </form>
        {previewError && <p className="form-error mt-3">{previewError}</p>}

        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between gap-2">
            <button type="button" className="btn-outline text-xs" disabled={busy} onClick={cancelMeeting}>
              Cancel the meeting
            </button>
            <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
