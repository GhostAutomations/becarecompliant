import "server-only";

/**
 * Be Care Compliant — the kept copy of an employee's absence meeting invitation (0406).
 *
 * Phil, 2026-10-06: an invitation went to Jo Bloggs and nothing of it was kept, because a
 * booked meeting has no Evidence until it is recorded. Now the EMPLOYEE's letter (the invitation,
 * and the letter when a meeting is rearranged) is saved as a PDF the moment it goes, listed in
 * the person's Evidence history and linked from the meeting line. Written once with the service
 * role; the table gives users no way to change or remove it.
 *
 * The PDF is the letter laid out like the company's own (invitation-letter-pdf.tsx), the same one
 * that was attached to the email.
 */

import { createHash, randomUUID } from "crypto";
import { createServiceClient } from "@/lib/supabase/admin";

const BUCKET = "evidence";

export function meetingLetterPath(companyId: string, letterId: string): string {
  return `${companyId}/meeting-letters/${letterId}.pdf`;
}

/**
 * When copies started being kept: 0406 went live at 13:09:52 UTC on 6 October 2026. Only a meeting
 * booked BEFORE this can be missing its copy for a good reason, so only those are made afterwards.
 * A later booking always keeps its own copy as the letter goes; making one for it on a page load
 * (while the real one is still being sent) gave the same meeting two copies, one wrongly marked
 * as made afterwards (review, 2026-10-07).
 */
export const COPIES_KEPT_FROM = "2026-10-06T13:09:52Z";

export const REBUILT_NOTICE =
  "Copy made afterwards from the booking details and the letter wording, as the original was sent before copies were kept.";

export type KeepMeetingLetterInput = {
  companyId: string;
  branchId: string | null;
  personId: string;
  meetingId: string;
  kind: "invite" | "rearranged";
  stage: number;
  meetingDate: string;
  meetingTime: string;
  subject: string;
  /** The letter as plain text, kept whole on the row. */
  letterText: string;
  /** The PDF exactly as it was attached to the email. */
  pdf: Buffer;
  emailedTo: string | null;
  sendOutcome: string;
  sentBy: { id: string; name: string | null };
  /** Made afterwards for a meeting booked before copies were kept. */
  rebuilt?: boolean;
  /** When the letter went. A copy made afterwards gives the booking time, so Evidence history
   *  dates and sorts it by the day it was sent, not the day the copy was made. */
  sentAt?: string;
};

/** Store and record the copy. Returns an error rather than throwing, so a booking that has already
 *  gone out is never undone by a copy that could not be kept; the caller says so on screen. */
export async function keepMeetingLetter(
  input: KeepMeetingLetterInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const id = randomUUID();
  const supabase = createServiceClient();
  const path = meetingLetterPath(input.companyId, id);
  const up = await supabase.storage.from(BUCKET).upload(path, input.pdf, { contentType: "application/pdf", upsert: false });
  if (up.error) return { ok: false, error: `the PDF could not be stored (${up.error.message})` };

  const { error } = await supabase.from("absence_meeting_letters").insert({
    id,
    company_id: input.companyId,
    person_id: input.personId,
    branch_id: input.branchId,
    meeting_id: input.meetingId,
    kind: input.kind,
    stage: input.stage,
    meeting_date: input.meetingDate,
    meeting_time: input.meetingTime,
    subject: input.subject,
    letter_text: input.letterText,
    emailed_to: input.emailedTo,
    send_outcome: input.sendOutcome,
    sent_by: input.sentBy.id,
    sent_by_name: input.sentBy.name,
    rebuilt: Boolean(input.rebuilt),
    ...(input.sentAt ? { sent_at: input.sentAt } : {}),
    pdf_path: path,
    pdf_sha256: createHash("sha256").update(input.pdf).digest("hex"),
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: `the copy could not be saved (${error.message})` };
  }
  return { ok: true, id };
}
