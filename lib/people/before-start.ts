/**
 * Be Care Compliant — a supervision, appraisal or probation date before the person started
 * (snag S19, Phil 3 Oct 2026, popup: refuse it).
 *
 * Smith Tacho Azang started on 21 April 2026 and his record carried a supervision done on
 * 31 December 2025, loaded from the monday board on 19 September. The register treated it as his
 * Supervision 1 and showed Supervision 2 overdue since March. A supervision, an appraisal or a
 * probation outcome can only happen while someone works here, so a date before the start date is
 * a mistake and is refused, with the reason, wherever a date is entered: completing the check, a
 * paper copy, the Probation Review, the import and history boxes. The database refuses it as well
 * (0377), so a data load cannot slip one in either.
 *
 * Training, Medication Competency, Manual Handling and the rest are NOT covered: those can come
 * from a previous job.
 */

/* The same words lib/dates.ts ukDate prints (kept here so this module has no imports and its unit
   test runs on its own). */
function ukDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Check keys whose completion cannot predate the start date. */
export const START_GUARDED_KEYS: ReadonlySet<string> = new Set(["supervision", "appraisal"]);

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Why this date will not do, or null when it will (or there is nothing to compare). */
export function beforeStartProblem(what: string, dateIso: string | null | undefined, startDate: string | null | undefined): string | null {
  if (!dateIso || !startDate || !ISO.test(dateIso) || !ISO.test(startDate)) return null;
  if (dateIso >= startDate) return null;
  return `The ${what} date, ${ukDate(dateIso)}, is before this person started on ${ukDate(startDate)}. Check the date and try again.`;
}
