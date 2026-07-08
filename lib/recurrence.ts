/**
 * Be Care Compliant — recurrence engine (Phase 3).
 *
 * The ONE shared, dependency-free helper for compliance date maths. Every Check
 * that schedules a next due date, and every RAG colour, routes through here so
 * the logic exists in exactly one place and can be unit-tested (lib/recurrence.test.ts).
 *
 * Design: compliance due dates are calendar dates (no time of day), so the core
 * arithmetic is pure proleptic-Gregorian calendar maths on a { year, month, day }
 * civil date. That makes month-boundary and leap-year behaviour deterministic and
 * timezone-free. The ONLY place a timezone matters is deciding what "today" is for
 * a user in the UK, so Europe/London is isolated to civilDateInLondon(); everything
 * else is pure. Adding a month never shifts across a DST change because we never
 * touch clock time.
 *
 * Agreed with Phil (2026-07-08 popups):
 *  - Next due = actual completion date + interval (drift-free), OR, for document
 *    checks (DBS, right to work), expiry-anchored: due = expiry date - leadDays.
 *  - RAG: overdue = red, within the amber window of the due date = amber, else green.
 *
 * Isomorphic: safe on server and client (no imports, no side effects).
 */

export type Frequency = "day" | "week" | "month" | "year";

/**
 * completion: next due is measured from the date the Form was actually completed
 *   (a supervision done today schedules the next one interval-from-today).
 * expiry: next due is measured back from a document's expiry date (right to work
 *   follows a visa expiry, DBS a renewal date), using leadDays as the warning lead.
 */
export type RecurrenceAnchor = "completion" | "expiry";

export type RecurrenceRule = {
  frequency: Frequency;
  /** How many frequency units between occurrences. Must be >= 1. */
  interval: number;
  /** Defaults to "completion". */
  anchor?: RecurrenceAnchor;
  /** Expiry anchor only: days before the expiry date the check becomes due. */
  leadDays?: number;
};

/** A calendar date with no time or timezone. month is 1-12, day is 1-31. */
export type CivilDate = { year: number; month: number; day: number };

export type Rag = "green" | "amber" | "red";

// ---------------------------------------------------------------------------
// Calendar primitives (pure, timezone-free)
// ---------------------------------------------------------------------------

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) throw new RangeError(`Invalid month: ${month}`);
  if (month === 2 && isLeapYear(year)) return 29;
  return MONTH_LENGTHS[month - 1];
}

/** Parse an ISO "YYYY-MM-DD" (extra time portion ignored) into a CivilDate. */
export function parseCivilDate(iso: string): CivilDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new RangeError(`Not an ISO date: ${iso}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Format a CivilDate as "YYYY-MM-DD" (the shape Postgres `date` accepts). */
export function formatCivilDate(d: CivilDate): string {
  const mm = String(d.month).padStart(2, "0");
  const dd = String(d.day).padStart(2, "0");
  return `${d.year}-${mm}-${dd}`;
}

// UTC is used purely as a calendar engine for day arithmetic: it has no DST, so
// adding days is exact. No clock time is ever exposed from these helpers.
function toUtc(d: CivilDate): Date {
  return new Date(Date.UTC(d.year, d.month - 1, d.day));
}
function fromUtc(dt: Date): CivilDate {
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

export function addDays(d: CivilDate, n: number): CivilDate {
  const dt = toUtc(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUtc(dt);
}

/**
 * Add n calendar months, clamping the day to the target month's length so month
 * boundaries and leap years behave: 31 Jan + 1mo = 28 Feb (29 in a leap year),
 * 31 Mar + 1mo = 30 Apr, 29 Feb + 1yr (12mo) = 28 Feb. n may be negative.
 */
export function addMonths(d: CivilDate, n: number): CivilDate {
  const monthIndex = d.year * 12 + (d.month - 1) + n;
  const year = Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12 + 1;
  const day = Math.min(d.day, daysInMonth(year, month));
  return { year, month, day };
}

/** Add one interval of a recurrence frequency to a date. */
export function addInterval(d: CivilDate, frequency: Frequency, interval: number): CivilDate {
  if (!Number.isInteger(interval) || interval < 1) {
    throw new RangeError(`Interval must be a positive integer, got ${interval}`);
  }
  switch (frequency) {
    case "day":
      return addDays(d, interval);
    case "week":
      return addDays(d, interval * 7);
    case "month":
      return addMonths(d, interval);
    case "year":
      return addMonths(d, interval * 12);
    default: {
      const _exhaustive: never = frequency;
      throw new RangeError(`Unknown frequency: ${_exhaustive}`);
    }
  }
}

/** Whole days from a to b (b - a). Negative when b is before a. */
export function daysBetween(a: CivilDate, b: CivilDate): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / MS_PER_DAY);
}

/** -1 if a<b, 0 if equal, 1 if a>b. */
export function compareCivil(a: CivilDate, b: CivilDate): number {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Timezone boundary (the ONLY DST-aware code) — what "today" is in the UK.
// ---------------------------------------------------------------------------

/**
 * The Europe/London calendar date at a given instant. This is the single place
 * timezone/DST matters: at 23:30 UTC in British Summer Time it is already the
 * next day in London, so a naive UTC date would compute RAG a day early.
 */
export function civilDateInLondon(instant: Date = new Date()): CivilDate {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export const todayInLondon = (now: Date = new Date()): CivilDate => civilDateInLondon(now);

// ---------------------------------------------------------------------------
// The compliance loop maths
// ---------------------------------------------------------------------------

/**
 * The next due date for a Check after it is satisfied.
 *  - completion anchor: completedOn + one interval.
 *  - expiry anchor: the document expiry date minus the rule's leadDays.
 * Returns null when the required input for the anchor is missing (e.g. a document
 * check with no expiry date yet), so the caller can leave it unscheduled.
 */
export function nextDueDate(
  rule: RecurrenceRule,
  opts: { completedOn?: CivilDate | null; expiryDate?: CivilDate | null },
): CivilDate | null {
  const anchor = rule.anchor ?? "completion";
  if (anchor === "expiry") {
    if (!opts.expiryDate) return null;
    return addDays(opts.expiryDate, -(rule.leadDays ?? 0));
  }
  if (!opts.completedOn) return null;
  return addInterval(opts.completedOn, rule.frequency, rule.interval);
}

/**
 * RAG status of a check given its due date and today. amberDays is the "due soon"
 * window (company default 30, overridable per check). A missing due date (an
 * unscheduled or not-yet-configured check) is neutral -> treated as green here;
 * the UI shows an explicit "not scheduled" state rather than a colour.
 */
export function ragStatus(
  due: CivilDate | null,
  today: CivilDate,
  amberDays: number,
): Rag {
  if (!due) return "green";
  const diff = daysBetween(today, due); // days until due; negative = overdue
  if (diff < 0) return "red";
  if (diff <= amberDays) return "amber";
  return "green";
}
