"use client";

/**
 * Be Care Compliant — Book a formal absence management meeting (Phase 6).
 * Booking is the invitation step: stage, who is holding it (Manager/Admin),
 * date, time and duration, then the employee and the conductor receive the
 * formal letter email with a timed .ics invite. Recording the meeting
 * afterwards (Record meeting) attaches the Evidence to this booking.
 *
 * The form lives in an inner component keyed per open, so reopening after a
 * successful booking always starts clean (a stale success state was closing
 * the dialog instantly: Phil, 2026-07-12).
 *
 * Two steps (Phil, 2026-09-29): the details, then both letters shown read only
 * for approval. Nothing is booked or sent until Approve and send. The details
 * form stays mounted (hidden) behind the letters, so Back returns to it with
 * every choice kept, and it is submitted by hand rather than as a form action
 * so React never resets it.
 *
 * Save and send, or Save and print (Phil, 2026-10-08: some post the letter out). Save and print
 * books it, keeps the letter and opens it to print; only the person holding the meeting is emailed.
 */

import { startTransition, useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IDLE_STATE, type ActionState } from "@/lib/forms";
import { bookAbsenceMeeting, previewBookAbsenceMeeting } from "@/lib/absence/actions";
import type { LetterPreviewState } from "@/lib/absence/letter-preview";
import LetterPreviewPanel from "@/components/absence/letter-preview-panel";
import type { ConductorLite, MeetingOffice } from "@/lib/absence/data";

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
  minStage,
  maxStage,
  conductors,
  offices,
  stageActions = {},
}: {
  personId: string;
  personName: string;
  /** Stage number to "Up to and including" wording from Settings, Absence (Phil, 2026-09-29).
   *  Only stages with an action set appear. */
  stageActions?: Record<number, string>;
  /** Suggested stage from the card's derived position, clamped 1 to 4. */
  defaultStage: number;
  /** Stages below this were already held or booked and are not offered
   *  (Phil, 2026-07-12); the "no further action" reset arrives with meeting
   *  outcomes (Additions). Server enforces the same rule. */
  minStage: number;
  /** Only stages the person's absence level actually calls for are offered
   *  (Phil, 2026-07-12): nothing above their derived stage. */
  maxStage: number;
  /** Active Managers + Admins: the only people who can hold the meeting. */
  conductors: ConductorLite[];
  /** Named offices (company office + branch offices) for the Location. */
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
  const open = openInstance > 0;

  return (
    <>
      <button
        type="button"
        className="btn-outline px-3 py-1.5 text-xs"
        onClick={() => setOpenInstance((n) => n + 1)}
      >
        Book meeting
      </button>
      {open &&
        createPortal(
          <BookMeetingForm
            key={openInstance}
            personId={personId}
            personName={personName}
            defaultStage={defaultStage}
            minStage={minStage}
            maxStage={maxStage}
            conductors={conductors}
            offices={offices}
            stageActions={stageActions}
            onClose={close}
          />,
          document.body,
        )}
    </>
  );
}

function BookMeetingForm({
  personId,
  personName,
  defaultStage,
  minStage,
  maxStage,
  conductors,
  offices,
  stageActions,
  onClose,
}: {
  personId: string;
  personName: string;
  defaultStage: number;
  minStage: number;
  maxStage: number;
  conductors: ConductorLite[];
  offices: MeetingOffice[];
  stageActions: Record<number, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [stage, setStage] = useState(defaultStage);
  const stageAction = stageActions[stage];
  const [state, action, pending] = useActionState(bookAbsenceMeeting, IDLE_STATE);
  const [preview, setPreview] = useState<LetterPreviewState | null>(null);
  const [previewing, startPreview] = useTransition();
  /** Exactly the details the letters were built from; Approve and send posts these. */
  const approved = useRef<FormData | null>(null);
  const letters = preview?.letters ?? null;

  function showLetters(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startPreview(async () => {
      const result = await previewBookAbsenceMeeting(fd);
      approved.current = result.letters ? fd : null;
      setPreview(result);
    });
  }

  /* Save and print runs the booking itself rather than through the effect below: booking moves the
     person's card (Tracking to Action required), which unmounts this dialog before an effect could
     point the tab at the letter (found in Chrome, 2026-10-08). The tab is opened on the click, so it
     is never blocked as a pop up, and filled from this closure once the letter is kept. */
  const [printState, setPrintState] = useState<ActionState>(IDLE_STATE);
  const [printing, startPrint] = useTransition();
  const shown = printState.ok || printState.error ? printState : state;
  const busy = pending || previewing || printing;

  function approve(delivery: "send" | "print") {
    const details = approved.current;
    if (!details) return;
    const fd = new FormData();
    for (const [k, v] of details.entries()) fd.append(k, v);
    fd.set("delivery", delivery);
    setPrintState(IDLE_STATE);
    if (delivery === "send") {
      startTransition(() => action(fd));
      return;
    }
    const tab = window.open("", "_blank");
    tab?.document.write("<p style=\"font-family:sans-serif\">Preparing the letter…</p>");
    startPrint(async () => {
      const result = await bookAbsenceMeeting(IDLE_STATE, fd);
      if (result.ok && result.data?.letterId) {
        if (tab) tab.location.href = `/api/absence/meeting-letter/${result.data.letterId}`;
      } else {
        tab?.close();
      }
      setPrintState(result);
    });
  }

  // Close on success and refresh the register (booked meetings advance the stage).
  useEffect(() => {
    if (shown.ok) {
      router.refresh();
      const t = setTimeout(onClose, 1200);
      return () => clearTimeout(t);
    }
  }, [shown.ok, router, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className={`max-h-[94vh] w-full overflow-y-auto rounded-2xl border border-white/15 bg-navy-900 p-5 shadow-2xl ${
          letters ? "max-w-2xl" : "max-w-sm"
        }`}
      >
        <h2 className="text-sm font-semibold text-white">
          {letters ? "Check the letters" : "Book meeting"}: {personName}
        </h2>
        {letters ? (
          <LetterPreviewPanel
            letters={letters}
            intro="Save and send emails both letters. Save and print opens the employee's letter to print and post or hand over, and only emails the person holding the meeting. Nothing is booked until you choose."
            approveLabel="Save and send"
            workingLabel="Sending…"
            pending={pending || printing}
            error={shown.error}
            ok={shown.ok}
            onBack={() => setPreview(null)}
            onApprove={() => approve("send")}
            print={{ label: "Save and print", workingLabel: "Saving…", onClick: () => approve("print"), working: printing }}
            onClose={onClose}
          />
        ) : (
          <p className="mt-1 text-xs text-white/50">
            The employee and the person holding the meeting receive a formal
            letter invitation with a calendar invite. You will see both letters
            before anything is sent.
          </p>
        )}
        <form onSubmit={showLetters} className={letters ? "hidden" : "mt-4 space-y-3"}>
          <input type="hidden" name="person_id" value={personId} />
          <div>
            <label htmlFor="bm-stage" className="form-label">Stage</label>
            <select
              id="bm-stage"
              name="stage"
              value={String(stage)}
              onChange={(e) => setStage(Number(e.target.value))}
              disabled={busy}
            >
              {([1, 2, 3, 4].filter((s) => s >= minStage && s <= maxStage)).map((s) => (
                <option key={s} value={s}>Stage {s}</option>
              ))}
            </select>
            {stageAction ? (
              <p className="mt-1 text-[10px] text-white/50">
                Up to and including: <span className="font-semibold text-white/80">{stageAction}</span>. The invitation tells them.
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="bm-conductor" className="form-label">Who is holding the meeting</label>
            <select id="bm-conductor" name="conducted_by" defaultValue="" required disabled={busy}>
              <option value="" disabled>Choose a Manager or Admin</option>
              {conductors.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.full_name || c.email) + (c.role === "company_admin" ? " (Admin)" : " (Manager)")}
                </option>
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
              disabled={busy}
            />
            <p className="mt-1 text-[10px] text-white/40">
              Formal meetings need at least 48 hours notice.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="bm-time" className="form-label">Time</label>
              <input id="bm-time" name="meeting_time" type="time" defaultValue="10:00" required disabled={busy} />
            </div>
            <div>
              <label htmlFor="bm-duration" className="form-label">Duration</label>
              <select id="bm-duration" name="duration" defaultValue="60" disabled={busy}>
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="bm-location" className="form-label">Location</label>
            <select id="bm-location" name="location_choice" defaultValue="" required disabled={busy}>
              <option value="" disabled>Choose a location</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id} disabled={!o.hasAddress}>
                  {o.label}{o.hasAddress ? "" : " (no address set)"}
                </option>
              ))}
              <option value="teams">Teams</option>
            </select>
            <p className="mt-1 text-[10px] text-white/40">
              An office prints its full address (Settings, Branches) in the
              letters. Teams tells them an invite will follow shortly.
            </p>
          </div>
          {preview?.error && <p className="form-error">{preview.error}</p>}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button type="submit" className="btn-primary text-xs" disabled={busy}>
              {previewing ? "Preparing letters…" : "Check the letters"}
            </button>
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={busy}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
