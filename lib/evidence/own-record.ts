/**
 * Be Care Compliant — nobody completes a check on their own record.
 *
 * Phil, 2026-10-11 (popup, audit step 7): nobody, whatever their role, completes a check or moves
 * a check's due date on their own People record. The database is where it is enforced (0444:
 * complete_check, submit_evidence, submit_paper_evidence, set_person_check_due and the history
 * import all refuse it, with these same words); the screens ask first so nothing is typed or
 * uploaded for nothing.
 *
 * Pure and importless so node --test can load it.
 */

/** The words the database uses when a check on your own record is refused. */
export const OWN_RECORD_CHECK_REFUSAL = "This is your own record, so someone else must complete this check.";

/** Is this People record the signed in person's own? A record with no login is nobody's. */
export function isOwnRecord(recordProfileId: string | null | undefined, userId: string | null | undefined): boolean {
  return !!recordProfileId && !!userId && recordProfileId === userId;
}
