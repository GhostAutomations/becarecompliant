"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ActionForm from "@/components/action-form";
import { saveTraining } from "@/lib/training/actions";
import { deriveRenewalDate } from "@/lib/training/renewal";
import { bookingNoteFor } from "@/lib/training/booking";
import type { TrainingCourse, TrainingCell } from "@/lib/training/data";

/**
 * Record one person's training on one course.
 *
 * TWO THINGS CHANGED ON 2026-08-01, both from Phil's review.
 *
 * The renewal date FOLLOWS the completion and the course's own renewal months as you pick the
 * date, and stops following the moment somebody types one, because a certificate that says
 * otherwise beats the rule. A date already stored that does not match the rule counts as typed,
 * so opening a record can never quietly rewrite it. The server fills a BLANK the same way; it
 * does not police a date it was given, deliberately, for the same reason.
 *
 * Clear no longer deletes on one press. It went through ActionForm's confirm, which exists
 * precisely because a confirming button must not be a submit button: the old one wiped a carer's
 * training history, and its certificate, with a single click and no question asked.
 *
 * A THIRD THING ON 2026-08-14: a course can be BOOKED. That is a date on this record and nothing
 * else. It does not touch the colour of the cell, the compliance score or the chasing digest,
 * because a carer booked onto Fire Safety has not done Fire Safety. Say so on the screen, in
 * words, so nobody books a course expecting the red to go away.
 */
export default function TrainingCellDialog({
  personId,
  personName,
  course,
  cell,
  onClose,
}: {
  personId: string;
  personName: string;
  course: TrainingCourse;
  cell: TrainingCell;
  onClose: () => void;
}) {
  const router = useRouter();
  const isOneOff = course.renewal_months == null;
  const hasRecord = !!cell.recordId;

  const [completed, setCompleted] = useState(cell.completedOn ?? "");
  const [expiry, setExpiry] = useState(cell.expiryOn ?? "");
  /*
   * Set once the manager has typed a renewal date herself, and STARTED that way when the stored
   * date is not the one the course rule would produce.
   *
   * Caught by review: deriving on mount silently replaced an override the moment the dialog
   * opened. A course re-accredited early, its date typed by hand, then opened again just to
   * attach a certificate, and Save quietly put it back to the rule. Worse, a record imported with
   * a renewal date and no completion had the field BLANKED and could not be saved at all.
   */
  /**
   * The booking, which is a plain date and nothing more. NOT derived from anything and deriving
   * nothing: it must never be able to move the completion, the renewal or the colour.
   */
  const [bookedFor, setBookedFor] = useState(cell.bookedFor ?? "");
  /**
   * Read from the state the SERVER worked out, never from a clock in this browser. A booking
   * judged against the user's device timezone would be a day out from the matrix behind it at
   * exactly the boundary where a day matters.
   */
  const storedNote = bookingNoteFor(cell.booking, cell.bookedFor ?? null);

  const [expiryEdited, setExpiryEdited] = useState(
    () => (cell.expiryOn ?? "") !== (deriveRenewalDate(cell.completedOn ?? "", course.renewal_months) ?? ""),
  );

  /** Follow the course rule only while the manager is picking a completion date herself. */
  const onCompletedChange = (value: string) => {
    setCompleted(value);
    if (isOneOff || expiryEdited) return;
    setExpiry(deriveRenewalDate(value, course.renewal_months) ?? "");
  };

  const done = () => {
    onClose();
    router.refresh();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-navy-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">{course.name}</h2>
        <p className="mt-1 text-sm text-white/55">
          {personName}
          {isOneOff ? " · one off course" : ` · renews every ${course.renewal_months} months`}
        </p>

        <ActionForm
          action={saveTraining}
          hidden={{ person_id: personId, course_id: course.id, intent: "save" }}
          label="Save"
          buttonClassName="btn-primary px-4 py-2 text-sm"
          className="mt-5 space-y-4"
          onDone={done}
        >
          <div className="flex flex-wrap gap-4">
            <div>
              <label htmlFor="completed_on" className="form-label">
                Completed
              </label>
              <input
                id="completed_on"
                name="completed_on"
                type="date"
                value={completed}
                onChange={(e) => onCompletedChange(e.target.value)}
                className="max-w-[10rem]"
              />
            </div>
            {!isOneOff && (
              <div>
                <label htmlFor="expiry_on" className="form-label">
                  Renewal due
                </label>
                <input
                  id="expiry_on"
                  name="expiry_on"
                  type="date"
                  value={expiry}
                  onChange={(e) => {
                    setExpiryEdited(true);
                    setExpiry(e.target.value);
                  }}
                  className="max-w-[10rem]"
                />
                <p className="mt-1 text-xs text-white/40">
                  {expiryEdited
                    ? "Set by hand. Clear it to go back to the course renewal."
                    : `Follows the completion date, ${course.renewal_months} months on.`}
                </p>
              </div>
            )}
          </div>

          {/* Booking. A DATE ON THE RECORD, not a status: see lib/training/booking.ts. */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <label htmlFor="booked_for" className="form-label">
              Booked for (optional)
            </label>
            <input
              id="booked_for"
              name="booked_for"
              type="date"
              value={bookedFor}
              onChange={(e) => setBookedFor(e.target.value)}
              className="max-w-[10rem]"
            />
            <p className="mt-1 text-xs text-white/40">
              {storedNote ??
                "The date this training is booked to happen. It does not count as done until it is recorded."}
            </p>
            {cell.bookedFor ? (
              <p className="mt-1 text-xs text-white/40">Clear the date and save to cancel the booking.</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="certificate" className="form-label">
              Certificate (optional)
            </label>
            {/*
              STYLED WITH file: MODIFIERS ON THE INPUT ITSELF, the pattern that is already
              working on the Care Plan upload. Deliberately NOT a label wrapped input: doing
              that to the Reg 80 image field broke it, and this is not the place to find out
              whether it was the wrapping or something else. Copy what works.
            */}
            <input
              id="certificate"
              name="certificate"
              type="file"
              accept=".pdf,.doc,.docx,image/*"
              className="mt-1 block w-full text-sm text-white/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-gold-400 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#0f1424] hover:file:bg-gold-400/90"
            />
            {cell.hasCertificate && cell.recordId ? (
              <a
                href={`/api/training/${cell.recordId}/certificate`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs text-gold-300 underline"
              >
                View current certificate
              </a>
            ) : null}
          </div>
        </ActionForm>

        <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-4">
          {hasRecord ? (
            <ActionForm
              action={saveTraining}
              hidden={{ person_id: personId, course_id: course.id, intent: "clear" }}
              label="Clear"
              savedLabel="Cleared"
              buttonClassName="btn-outline border-rag-red/40 px-3 py-2 text-xs text-rag-red-soft hover:bg-rag-red/10"
              className=""
              confirm={`Clear ${course.name} for ${personName}? The dates and any certificate go with it, and this cannot be undone.`}
              onDone={done}
            />
          ) : null}
          <button type="button" onClick={onClose} className="btn-ghost ml-auto px-3 py-2 text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
