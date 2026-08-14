/**
 * Be Care Compliant - training BOOKINGS. Pure, and deliberately IMPORTLESS.
 *
 * Same rule as lib/training/renewal.ts, for the same reason: the test harness is
 * `node --experimental-strip-types --test` with no path aliases, so a single runtime import of
 * "@/lib/..." makes this file untestable.
 *
 * WHAT A BOOKING IS, AND WHAT IT IS NOT (Phil, 2026-08-14).
 *
 * A booking is a SEPARATE FACT from a training record's status, not a third value of it. That is
 * the whole design, and it is what makes the decision below true by construction rather than by
 * everybody remembering it:
 *
 *   a booked course is STILL NOT COMPLIANT.
 *
 * A carer booked onto Moving and Handling for the third of September has not done Moving and
 * Handling. The matrix still shows the cell red, the compliance score still counts it against
 * the company, the PQS measure still marks it down and the daily digest still chases it. All of
 * that follows from trainingStatus() in renewal.ts never being shown a booking: it cannot be
 * softened by a booking because it cannot see one. Widening the status column instead would have
 * put "booked" on the same axis as "completed", and then every one of those four places would
 * have had to remember to treat it as not done.
 *
 * It also lets a course be BOTH. A first aid certificate that is valid until December can be
 * booked for renewal in November: in date and booked, two facts, two columns.
 *
 * NO CLOCK. today is an argument, always. A pure function that reads the time is a function
 * whose tests pass in August and fail in September.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 *   none    nothing booked.
 *   booked  a date today or later. The course is not done, and somebody has arranged for it
 *           to be.
 *   missed  the date has gone by and no completion was recorded against it.
 */
export type BookingState = "none" | "booked" | "missed";

/** Whole days from a to b. Negative when b is before a. Plain civil dates, no zone. */
function daysBetweenIso(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split("-").map(Number);
  const [by, bm, bd] = bIso.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * The state of a booking on a given day.
 *
 * BOOKED ON THE DAY ITSELF, not missed. The training runs at some hour we do not know and the
 * record is written afterwards, often the next morning. Flipping a course to "missed" at one
 * minute past midnight on the morning it is being delivered would tell a manager her team missed
 * a session they are sitting in.
 *
 * A booking is CLEARED by the completion that keeps it, in the database (migration 0186), not
 * here. That is why this function needs nothing but the date: by the time a kept booking would
 * read as missed, it is already gone.
 */
export function bookingState(bookedFor: string | null | undefined, todayIso: string): BookingState {
  if (!bookedFor || !ISO.test(bookedFor) || !ISO.test(todayIso)) return "none";
  return daysBetweenIso(todayIso, bookedFor) >= 0 ? "booked" : "missed";
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * "3 Sep", or "3 Sep 2027" once the year stops being the obvious one.
 *
 * A matrix cell is about seven characters wide, so the year is dropped when it is this year and
 * kept when it is not: "3 Sep" in a column of 2026 dates is unambiguous, and a renewal booked
 * for 2027 that read "3 Sep" would be a year out on the one screen a manager plans from.
 *
 * NEVER a raw ISO date. That leak has been fixed twice in this codebase already.
 */
export function shortDate(iso: string, todayIso: string): string {
  if (!ISO.test(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const name = MONTHS_SHORT[m - 1] ?? "";
  const sameYear = ISO.test(todayIso) && Number(todayIso.slice(0, 4)) === y;
  return sameYear ? `${d} ${name}` : `${d} ${name} ${y}`;
}

/** "3 September 2026". Always with the year: this one is read in a sentence, not a column. */
export function longDate(iso: string): string {
  if (!ISO.test(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_LONG[m - 1] ?? ""} ${y}`;
}

/**
 * What the matrix cell says underneath the date, or null for nothing.
 *
 * ONLY a live booking is captioned (Phil, 2026-08-14): "after the date the cell stops saying
 * Booked and reads as overdue again". A cell that went on announcing a booking nobody kept would
 * read like an excuse, and the point of the red is that the training has not been done.
 * The missed booking is not lost, it moves to the record, which is where somebody can act on it.
 */
export function bookingCaption(bookedFor: string | null | undefined, todayIso: string): string | null {
  return bookingState(bookedFor, todayIso) === "booked"
    ? `Booked ${shortDate(bookedFor as string, todayIso)}`
    : null;
}

/**
 * The line on the record itself, where a missed booking IS worth saying out loud.
 *
 * TAKES THE STATE, not a date and a clock. The dialog is a client component, and working today
 * out in the browser would judge a booking against the user's device timezone while the matrix
 * behind it judged the same booking in Europe/London. One of the two would be a day out at the
 * boundary, which is precisely the day it matters.
 */
export function bookingNoteFor(state: BookingState, bookedFor: string | null | undefined): string | null {
  if (state === "none" || !bookedFor || !ISO.test(bookedFor)) return null;
  const when = longDate(bookedFor);
  return state === "booked"
    ? `Booked for ${when}. This course still counts as outstanding until it is recorded.`
    : `Booked for ${when}, and nothing was recorded. That booking was missed.`;
}

/** The same line, worked out from a date and a day. Server side, where the day is London's. */
export function bookingNote(bookedFor: string | null | undefined, todayIso: string): string | null {
  return bookingNoteFor(bookingState(bookedFor, todayIso), bookedFor);
}

/**
 * WHAT A SAVE SHOULD WRITE when a booking is involved.
 *
 * PURE, AND TESTED, BECAUSE THE OBVIOUS VERSION OF THIS DESTROYED TRAINING RECORDS.
 *
 * The first cut decided "this is a booking on its own" from the FORM alone: no completion date
 * and no renewal date submitted meant status 'not_done'. Caught by review before it shipped, and
 * it would have been quiet and expensive.
 *
 * A one off course carries NO renewal field in the dialog, and the spreadsheet importer records a
 * ticked one off as completed with no dates whatsoever, which is how Phil's first 518 records
 * arrived. So for one of those, both date fields submit blank however green the cell is. A
 * manager clicking that green tick to book a refresher would have written status 'not_done' and
 * nulled the dates over the top of a completed record: the cell goes red, the mandatory
 * compliance figure drops on the matrix, the dashboard, the report and the carer's own screen,
 * the toast says "Booking saved", and nothing anywhere says a completion was destroyed.
 *
 * THE RULE, therefore: a booking never touches the completion. Dates submitted are written as
 * given; when none are, whatever the record already holds is left exactly as it is, and only a
 * record that does not exist at all starts life as 'not_done'.
 */
export function trainingWritePlan(opts: {
  /** The completion date the form submitted, already validated, or null. */
  completed: string | null;
  /** The renewal date to store: typed, or derived from the completion. Null when neither. */
  expiry: string | null;
  /** The booking date the form submitted. Null CLEARS the booking. */
  bookedFor: string | null;
  /** What the record already holds, or null when there is no record yet. */
  existing: { status: string; completedOn: string | null; expiryOn: string | null } | null;
}): {
  status: string;
  completedOn: string | null;
  expiryOn: string | null;
  bookedFor: string | null;
  /** True only when this save is nothing but a booking. Drives the wording and the audit line. */
  bookingOnly: boolean;
} {
  const bookingOnly = !opts.completed && !opts.expiry;
  if (bookingOnly && opts.existing) {
    return {
      status: opts.existing.status,
      completedOn: opts.existing.completedOn,
      expiryOn: opts.existing.expiryOn,
      bookedFor: opts.bookedFor,
      bookingOnly: true,
    };
  }
  return {
    // Booking somebody onto a course they have never done leaves it NOT DONE, which is the
    // whole point: the matrix stays red and the company stays short of compliant.
    status: bookingOnly ? "not_done" : "completed",
    completedOn: opts.completed,
    expiryOn: opts.expiry,
    bookedFor: opts.bookedFor,
    bookingOnly,
  };
}

/**
 * SORT KEY: a live booking first, soonest first, everything else after.
 *
 * WHY (Phil, 2026-08-14, found by logging in as a carer rather than by reading the code). Her
 * own screen listed a booked course alphabetically among thirty two others, inside a section
 * that is folded shut by default. The one line on that list that is about the FUTURE and needs
 * her to do something, turn up, was the hardest one on it to find.
 *
 * A missed booking sorts with the rest deliberately. She cannot act on it; it is her manager's
 * to sort out, and floating it to the top of her list would only tell her off.
 */
export function bookingSortKey(booking: BookingState, bookedFor: string | null | undefined): string {
  // "0" + an ISO date sorts correctly as plain text, which is the whole reason the dates are
  // stored ISO. Everything else gets "1" and keeps whatever order the caller had.
  return booking === "booked" && bookedFor && ISO.test(bookedFor) ? `0${bookedFor}` : "1";
}
