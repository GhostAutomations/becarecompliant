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

/** A plain UK date for a message a manager reads. Local, because this module imports nothing. */
function ukDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Refuse a training date that says something has already happened when it has not.
 *
 * WHY IT EXISTS (Phil, item 5 of Operation Thistle). Two Safeguarding rows on the live Thistle
 * register carried a completion date in 2027 and one in 2028. Nothing in the app invented them:
 * the import reads a RENEWAL date and works the completion back from the course period, so a
 * twelve month course carrying a renewal date two years out can only mean a completion a year
 * from now. The board was wrong and the import copied it faithfully, which is exactly the shape
 * of error nobody spots, because a green tick is what a future completion looks like.
 *
 * THE RULE IS THE IMPOSSIBLE ONE, not "beyond the course period" (Phil, popup 2026-09-22).
 * On the import the two are the same thing: the cell holds a renewal date, so a renewal further
 * out than the period ALWAYS derives a completion that has not happened. On the dialog, where a
 * manager types both dates, they are not the same: a course configured at twelve months can quite
 * properly carry a three year certificate, and refusing that would destroy the override the
 * dialog exists to offer. What cannot be argued with is a completion in the future.
 *
 * A BOOKING IS NOT A COMPLETION and is untouched here. Booking a carer onto next month's course
 * is the normal case and lives in its own column.
 *
 * Returns the sentence to show, or null when the dates are possible.
 */
export function impossibleTrainingDate(opts: {
  /** The course as the person reading this knows it, e.g. "Safeguarding of Vulnerable Adults". */
  courseName: string;
  /** A typed completion date, when there is one. */
  completedIso: string | null;
  /** A renewal date, typed or read from an import cell. */
  expiryIso: string | null;
  /** The course's own renewal period. Null for a one off, which cannot derive anything. */
  renewalMonths: number | null;
  todayIso: string;
}): string | null {
  if (!ISO.test(opts.todayIso)) return null;

  /*
   * A TYPED COMPLETION WINS. It is the stronger statement of the two, and it is the one that
   * decides whether the renewal date needs questioning at all: a certificate completed last
   * March that runs for three years is somebody's real certificate, not a mistake.
   */
  if (opts.completedIso && ISO.test(opts.completedIso)) {
    if (opts.completedIso > opts.todayIso) {
      return `${opts.courseName} cannot have been completed on ${ukDate(opts.completedIso)}, because that date has not happened yet.`;
    }
    return null;
  }

  if (!opts.expiryIso || !ISO.test(opts.expiryIso)) return null;
  const derived = deriveCompletedDate(opts.expiryIso, opts.renewalMonths);
  if (!derived || derived <= opts.todayIso) return null;

  const months = opts.renewalMonths as number;
  return `${opts.courseName} renews every ${months} ${months === 1 ? "month" : "months"}, so a renewal date of ${ukDate(opts.expiryIso)} means it was completed on ${ukDate(derived)}, which has not happened yet. Check the date on the certificate.`;
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
export function trainingHeader(name: string, _renewalMonths: number | null): string {
  /* THE COLUMN IS THE COURSE (Phil, 2026-09-17: "the columns on the template match the
     columns in the matrix"). The training matrix heads each column with the course name and
     nothing else, so the template does too.

     It used to append "renewal date" or "(completed)" to say which date the cell wanted.
     That guidance now lives on the import page, where it can be read once instead of thirty
     three times, and the parser never needed it: it already knows whether a course recurs.
     The suffix also meant a course that changed from recurring to one off silently renamed
     its own column. */
  return name;
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
