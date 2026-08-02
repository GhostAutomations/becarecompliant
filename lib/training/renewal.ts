/**
 * Be Care Compliant - training renewal arithmetic. Pure, and deliberately IMPORTLESS.
 *
 * Nothing is imported here, exactly as in lib/recurrence.ts, because the test harness is
 * `node --experimental-strip-types --test` with no path aliases: a single runtime import of
 * "@/lib/recurrence" makes this file untestable. The two decisions the whole department rests on
 * (when does this fall due again, and what state is it in today) are worth being able to test
 * without a database, a session or a clock.
 *
 * THE DUPLICATION IS DELIBERATE AND PROVEN. addMonths here repeats lib/recurrence.ts's month
 * arithmetic, which is normally the thing to avoid: a second copy of a rule is how the invoicing
 * cron came to bill £89.32 where the builder billed £89.25. renewal.test.ts therefore imports
 * BOTH and asserts they agree across every month of several years, so the copy cannot drift
 * without a test going red.
 *
 * NO CLOCK. Every function takes today as an argument. A pure function that reads the time is a
 * function whose tests pass in July and fail in August.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** Add whole months, CLAMPING to the end of the month. 31 Jan plus one month is 28 Feb. */
function addMonthsIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const monthIndex = y * 12 + (m - 1) + n;
  const year = Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12 + 1;
  const day = Math.min(d, daysInMonth(year, month));
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Whole days from a to b. Negative when b is before a. Both are plain civil dates, no zone. */
function daysBetweenIso(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split("-").map(Number);
  const [by, bm, bd] = bIso.split("-").map(Number);
  const MS_PER_DAY = 86_400_000;
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / MS_PER_DAY);
}

/**
 * When does this training fall due again?
 *
 * WHY IT EXISTS (Phil, 2026-08-01). The dialog said "renews every 24 months" and then made you
 * type the renewal date yourself, for every course and every person, when the app already knew
 * the answer. Thirty three courses across forty staff is 1,320 dates typed by hand, each one a
 * chance to put a carer's fire training a year out.
 *
 * Month ends clamp: training completed on 31 January renewing in one month falls due on 28
 * February, not the 3rd of March. Getting that wrong shortens or lengthens a certificate.
 *
 * Returns null for a one off course (no renewal months) or a date that is not a date.
 */
export function deriveRenewalDate(completedIso: string, renewalMonths: number | null): string | null {
  if (renewalMonths == null || !Number.isInteger(renewalMonths) || renewalMonths < 1) return null;
  if (!ISO.test(completedIso)) return null;
  return addMonthsIso(completedIso, renewalMonths);
}

/**
 * The completion a renewal date implies. The inverse of deriveRenewalDate.
 *
 * WHY IT EXISTS. A care company's training matrix holds RENEWAL dates, not completion dates:
 * that is what Phil's Training.xlsx carried and what the 518 imported records were built from.
 * The import therefore reads a renewal date and works the completion back from it, so a row can
 * be typed the way the company already keeps it.
 */
export function deriveCompletedDate(renewalIso: string, renewalMonths: number | null): string | null {
  if (renewalMonths == null || !Number.isInteger(renewalMonths) || renewalMonths < 1) return null;
  if (!ISO.test(renewalIso)) return null;
  return addMonthsIso(renewalIso, -renewalMonths);
}

export type TrainingStatus = "valid" | "due_soon" | "expired" | "missing";

/**
 * The state of one person on one course, from the stored dates alone.
 *
 * The SAME rule the matrix colours by, the filter narrows by and the digest chases on, in ONE
 * place, so a carer cannot be amber on screen and absent from the email meant to chase it.
 *
 *   missing   no record at all. Both this and expired are red on the matrix, but the digest has
 *             to tell them apart to write a sentence a manager can act on. A record with no
 *             dates is still a record: a one off course is often just ticked.
 *   expired   a renewal date in the past.
 *   due_soon  a renewal date within the course's own amber window, or today.
 *   valid     everything else, including a one off course that has been done.
 */
export function trainingStatus(opts: {
  /**
   * Is there a completed record at all?
   *
   * PASSED IN, never inferred from the dates. The first version of this worked "done" out from
   * whether a date was present, and it was wrong the moment it met real data: Phil's spreadsheet
   * import marked one off courses as completed with NO dates at all, because the cell simply said
   * "Completed". Ninety records went from green to red on the live matrix. A record's existence
   * and its dates are two different facts and only the caller knows the first.
   */
  recorded: boolean;
  expiryOn: string | null;
  amberDays: number;
  /** One off courses have no renewal months and never expire once done. */
  oneOff: boolean;
  todayIso: string;
}): TrainingStatus {
  if (!opts.recorded) return "missing";
  if (opts.oneOff || !opts.expiryOn || !ISO.test(opts.expiryOn)) return "valid";
  if (!ISO.test(opts.todayIso)) return "valid";

  const days = daysBetweenIso(opts.todayIso, opts.expiryOn);
  if (days < 0) return "expired";
  // Due ON the threshold counts as due soon, not valid: a certificate with exactly thirty days
  // left is the one you want on today's list, not tomorrow's.
  return days <= Math.max(0, opts.amberDays) ? "due_soon" : "valid";
}

/** Days until the renewal date. Negative once it has passed. Null when there is no date. */
export function daysUntilRenewal(expiryOn: string | null, todayIso: string): number | null {
  if (!expiryOn || !ISO.test(expiryOn) || !ISO.test(todayIso)) return null;
  return daysBetweenIso(todayIso, expiryOn);
}

/** "expired 12 days ago" / "due in 5 days" / "due today", for an email read at seven in the morning. */
export function renewalPhrase(days: number): string {
  if (days < 0) {
    const n = Math.abs(days);
    return `expired ${n} ${n === 1 ? "day" : "days"} ago`;
  }
  if (days === 0) return "due today";
  return `due in ${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * The import column heading for a course. It STATES what the cell should hold.
 *
 * A recurring course asks for the renewal date, because that is the date a training matrix is
 * normally kept in: it is what Phil's Training.xlsx held and what the first 518 records were
 * built from. A one off cannot run out, so it asks for the opposite. Saying so in the heading is
 * the difference between an unambiguous file and a year of certificates being a year out.
 */
export function trainingHeader(name: string, renewalMonths: number | null): string {
  return renewalMonths == null ? `${name} (completed)` : `${name} renewal date`;
}

/** How an import header is compared: trimmed, case insensitive, inner spacing collapsed. A
 *  manager retyping a heading in Excel should not lose a whole course. */
export function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Compare the headings in an uploaded file with the ones we expect.
 *
 * THE QUESTION THIS ANSWERS (Phil, 2026-08-01): "will the download template match column names if
 * a company changes them?" At the moment of download, yes, because the template is generated from
 * that company's own live course names. The hazard is a file downloaded BEFORE a rename: the old
 * heading no longer matches anything, and matching by name alone would skip that whole course in
 * silence, which is what the People importer does to this day.
 *
 * Both directions come back so the preview can name them before a single row is written.
 */
export function classifyHeaders(
  fileHeaders: string[],
  expected: string[],
): { unknown: string[]; missing: string[] } {
  const expectedKeys = new Set(expected.map(normaliseHeader));
  const fileKeys = new Set(fileHeaders.map(normaliseHeader).filter((h) => h !== ""));
  return {
    unknown: fileHeaders.filter((h) => h.trim() !== "" && !expectedKeys.has(normaliseHeader(h))),
    missing: expected.filter((h) => !fileKeys.has(normaliseHeader(h))),
  };
}
