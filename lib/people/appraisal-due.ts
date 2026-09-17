/**
 * Be Care Compliant - has the appraisal that this deadline was set for already been done?
 *
 * Pure and deliberately IMPORTLESS so node --test can load it: the rest of lib/people/logic.ts
 * imports through path aliases and cannot be unit tested, which is why every break in it has been
 * found on screen instead.
 *
 * THE RULE. An appraisal falls due one supervision interval after Supervision 3. So the thing
 * that discharges it is an appraisal done AFTER that supervision, whether it landed before the
 * deadline or after it. Compare against the anchor, not against the due date: Chloe Driscoll's
 * Supervision 3 was 03/04/2026, making her appraisal due 22/06/2026, and she was appraised early
 * on 05/06/2026. Measured against the due date she looks outstanding and the cell goes red, next
 * to a green completed date saying she did it on time.
 *
 * WHY IT EXISTS (Phil, 2026-09-17): "they have pills in them when they shouldnt as the text is
 * green in the done column", and before that "there is a red pill in appraisal due with a green
 * completed date".
 *
 * An appraisal done BEFORE the anchor belongs to the previous cycle and settles nothing: that
 * deadline is genuinely outstanding and genuinely carries a pill.
 *
 * ISO dates compare correctly as strings, which is why there is no date import here.
 */
export function appraisalDueMet(anchor: string | null, comp: string | null): boolean {
  if (!anchor || !comp) return false;
  return comp > anchor;
}
