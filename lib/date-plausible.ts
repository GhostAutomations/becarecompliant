/**
 * The real-world year range for typed dates.
 *
 * IMPORTLESS on purpose, so it can be unit tested under
 * node --experimental-strip-types (see the note in lib/dates.test.ts).
 *
 * Why it exists: Chrome's date control turns a typed two-digit year into the
 * literal year 0026, and one reached a live holiday card as
 * "Back at work 19 Feb 0026" (17 Aug QA). Wide enough for any date of birth,
 * tight enough to catch a mistyped year.
 */
export const DATE_YEAR_MIN = 1900;
export const DATE_YEAR_MAX = 2100;

/** null when the ISO date's year is plausible; the refusal message otherwise. */
export function implausibleYearMessage(isoDate: string): string | null {
  const year = Number(isoDate.slice(0, 4));
  if (!Number.isFinite(year) || year < DATE_YEAR_MIN || year > DATE_YEAR_MAX) {
    return `Enter a real year (between ${DATE_YEAR_MIN} and ${DATE_YEAR_MAX}).`;
  }
  return null;
}
