/**
 * Be Care Compliant — where a planner booking takes you.
 *
 * WHY (Phil, 2026-09-08): "if they are in their planner and they are about to complete
 * the supervision or spot check from this page they need to go to people or service
 * users." The planner told a manager what to do today and then made her navigate to the
 * right register, find the person and find the check before she could do it. The board
 * already knows which check on which record the task is, so the task itself is the way in.
 *
 * A PLANNED task with a check opens that check's form, ready to complete. Anything else
 * opens the record: an ad-hoc task with no check has no form to open, and a task already
 * completed must not offer to complete it a second time -- the record is where its
 * Evidence and its new due date are.
 *
 * Pure and self-contained (no imports) so it can be unit tested.
 */

export type BookingLink = {
  population: "people" | "service_users" | null;
  subjectId: string | null;
  checkInstanceId: string | null;
  /** Set instead of checkInstanceId when the task is for a tracker form. Never both. */
  trackerFormKey?: string | null;
  status: "planned" | "completed" | "cancelled";
};

/** The URL a booking should open, or null when there is nothing to open. */
export function bookingHref(booking: BookingLink): string | null {
  const { population, subjectId, checkInstanceId, trackerFormKey, status } = booking;
  if (!population || !subjectId) return null;
  const record = population === "people" ? `/people/${subjectId}` : `/service-users/${subjectId}`;
  if (status !== "planned") return record;
  /* Probation, DBS and Right to Work are tracker forms with no check instance, so they
     open by form key instead. Only a person has them. */
  if (trackerFormKey && population === "people") {
    return `${record}/tracker/${trackerFormKey}/complete`;
  }
  if (!checkInstanceId) return record;
  return `${record}/checks/${checkInstanceId}/complete`;
}
