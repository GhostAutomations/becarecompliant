/**
 * Be Care Compliant - is the appraisal's stored due date still outstanding?
 *
 * Pure and deliberately IMPORTLESS so node --test can load it: the rest of lib/people/logic.ts
 * imports through path aliases and cannot be unit tested, which is why every break in it has been
 * found on screen instead.
 *
 * WHY IT EXISTS (Phil, 2026-09-17): "there is a red pill in appraisal due with a green completed
 * date". The Appraisal pair was built on the assumption that its Due is ALWAYS the next one and
 * its Done is always the last one, so the Due always carried the outstanding pill. That held while
 * the due date was only ever derived, because a derived one is always in the future. Since a
 * company can now bring its own appraisal due date across, the stored date can be the deadline the
 * last appraisal MET: Janet Oladunni was appraised on 03/07/2026 against a due date of 03/07/2026,
 * and the row read red for overdue next to a green completed on the same day.
 *
 * Met means a completion on or after the due date. An appraisal done BEFORE a due date that has
 * since passed has not met it: that cycle really is outstanding and really is red.
 *
 * ISO dates compare correctly as strings, which is why there is no date import here.
 */
export function appraisalDueMet(nextDue: string | null, comp: string | null): boolean {
  if (!nextDue || !comp) return false;
  return comp >= nextDue;
}
