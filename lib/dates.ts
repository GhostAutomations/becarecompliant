/**
 * Be Care Compliant — ONE date format for anything a customer or an inspector reads.
 *
 * Written 2026-08-10 after live testing found an inspection record printing "Date of Meeting:
 * 2026-07-16" and the dashboard activity feed printing "booked for 2026-08-19". Those came from
 * two independent places that interpolated a database string straight into customer facing text.
 *
 * This is deliberately NOT a rewrite of every date in the app. The register's compact "22 Mar 26"
 * and the letters' "14 August 2026" both exist for good reasons in their own contexts. This is the
 * format for prose and for documents: long month, full year, no ambiguity between British and
 * American order on a document that may be read by a regulator.
 *
 * IMPORTLESS, so it is safe to import from a client component, a server action, a PDF renderer or
 * a plain string template, and so it can be unit tested.
 */

const ISO = /^\d{4}-\d{2}-\d{2}/;

/**
 * "2026-07-16" becomes "16 July 2026".
 *
 * Anything that is not an ISO date is handed back UNCHANGED rather than turned into "Invalid
 * Date": a summary line that reads oddly is recoverable, one that reads as a date but is not is
 * not. Parsed and formatted in UTC so a civil date can never slide a day across a timezone.
 */
export function ukDate(value: string | null | undefined): string {
  if (!value) return "";
  const text = String(value);
  if (!ISO.test(text)) return text;
  const [y, m, d] = text.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return text;
  /*
   * Date.UTC HAPPILY ROLLS FORWARD: month 13 becomes January, the 30th of February becomes the
   * 2nd of March. Silently turning a nonsense date into a real one on a document a regulator
   * reads is worse than printing the nonsense, so the round trip is checked and anything that
   * does not survive it is handed back untouched.
   */
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return text;
  return dt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Add whole years to an ISO civil date, clamping the day when the target month is shorter.
 *
 * Written for the eight year evidence retention rule (THE LIST item 18), which has to turn a
 * leaving date into "the earliest date this may be anonymised" and get it right on paper.
 *
 * Deliberately string in, string out, with no Date arithmetic anywhere: a retention date
 * built by `new Date(...)` in one timezone and read back in another can slide a day, and this
 * particular day decides when somebody's records are destroyed.
 *
 * 29 February CLAMPS to 28 February in a non leap year rather than rolling forward to 1 March.
 * Both are defensible; clamping is chosen because it never lands the record in a later month
 * than the anniversary, and because it matches how a person would read "eight years later".
 *
 * Anything that is not an ISO date returns null: better no retention date than a wrong one.
 */
export function addYearsIso(iso: string, years: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]) + years;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

/*
 * SHORT DATES, AND WHY THE MONTHS ARE WRITTEN OUT.
 *
 * Caught in review 2026-08-15. Every short date in the app went through
 * toLocaleDateString("en-GB", { month: "short" }), and current ICU renders September as "Sept".
 * So the Planner's week heading said "6 Sep" while its own List view said "6 Sept", and flipping
 * the Month / Week / List toggle changed the spelling of the month on the same booking. It also
 * differs between the server render and the browser, depending on which ICU each is carrying.
 *
 * The same twelve strings as lib/training/booking.ts, which cannot import this file: it has to
 * stay importless to run under the node test harness. That duplication is the renewal.ts and
 * recurrence.ts arrangement, and lib/planner/week.test.ts asserts the copies agree, so they
 * cannot drift without a test going red.
 */
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-09-06" becomes "6 Sep 2026". Anything that is not a date is handed back unchanged. */
export function ukShortDate(value: string | null | undefined): string {
  const parts = civilParts(value);
  if (!parts) return value ? String(value) : "";
  return `${parts.day} ${MONTHS_SHORT[parts.monthIndex]} ${parts.year}`;
}

/** "Sun 6 Sep". For a dense list where the year is obvious from the heading above it. */
export function ukShortDateWithWeekday(value: string | null | undefined): string {
  const parts = civilParts(value);
  if (!parts) return value ? String(value) : "";
  return `${WEEKDAYS_SHORT[parts.weekday]} ${parts.day} ${MONTHS_SHORT[parts.monthIndex]}`;
}

/** "6 Sep". The year left off on purpose, for a column that is already dated. */
export function ukShortDayMonth(value: string | null | undefined): string {
  const parts = civilParts(value);
  if (!parts) return value ? String(value) : "";
  return `${parts.day} ${MONTHS_SHORT[parts.monthIndex]}`;
}

/** Split an ISO date, refusing anything that does not survive the round trip, as ukDate does. */
function civilParts(
  value: string | null | undefined,
): { day: number; monthIndex: number; year: number; weekday: number } | null {
  if (!value) return null;
  const text = String(value);
  if (!ISO.test(text)) return null;
  const [y, m, d] = text.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { day: d, monthIndex: m - 1, year: y, weekday: dt.getUTCDay() };
}
