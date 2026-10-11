/**
 * Be Care Compliant — a check recorded as done on a date that has not happened yet (audit F60,
 * Phil 11 Oct 2026, popup: refuse it).
 *
 * History with no Evidence ("They already work here" on Add a person, and the import) says when a
 * check was last done before the record joined us. A date after today is a typing mistake, and
 * stored as the latest completion it would push the next due date years out with nothing behind
 * it. Refused before anything is saved, so what was typed stays on the form and the import
 * preview shows the row before Import is pressed. The database refuses it as well
 * (seed_migrated_completion), so no other route can store one.
 *
 * Tracker document dates (DBS renewal, right to work expiry, visa expiry) are NOT completions and
 * are often in the future, so they never come through here.
 */

/* The same words lib/dates.ts ukDate prints (kept here so this module has no imports and its unit
   test runs on its own). */
function ukDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Why this completion date will not do, or null when it will. `todayIso` is today in
 *  Europe/London (todayIso in lib/people/logic.ts), passed in so the rule can be tested. */
export function futureDateProblem(what: string, dateIso: string | null | undefined, todayIso: string): string | null {
  if (!dateIso || !ISO.test(dateIso) || !ISO.test(todayIso)) return null;
  if (dateIso <= todayIso) return null;
  return `The ${what} date, ${ukDate(dateIso)}, is in the future. A check can only be recorded as done on today or an earlier date.`;
}
