/**
 * Be Care Compliant - the Planner's week arithmetic. Pure, and deliberately IMPORTLESS.
 *
 * Lifted out of components/planner/whiteboard-calendar.tsx in review (2026-08-15). It was date
 * logic living in a "use client" .tsx, where the node test harness cannot reach it, and date
 * logic is exactly the kind that looks right and is wrong one week a year. The codebase already
 * has this pattern for every decision worth keeping honest: renewal.ts, booking.ts, scope.ts,
 * manage-scope.ts.
 *
 * EVERYTHING IS CIVIL-DATE ARITHMETIC IN UTC. The app's "today" comes from
 * Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }), so the strings are London civil
 * dates; doing the sums in UTC means the clocks going back cannot shift a day sideways.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/*
 * WRITTEN OUT, NOT TAKEN FROM toLocaleDateString (caught by the test beside this file).
 *
 * en-GB renders September as "Sept" in current ICU, so the Planner would have said "6 Sept" on
 * the same screen where lib/training/booking.ts says "3 Sep". Two spellings of one month, decided
 * by whichever ICU the runtime happens to carry, and different again between the server render
 * and the browser. The same list as booking.ts, so the whole app abbreviates a month one way.
 */
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The Monday of the week an ISO date falls in. Weeks start Monday, like the grid headings. */
export function mondayOf(iso: string): string {
  if (!ISO.test(iso)) return iso;
  const d = new Date(`${iso}T00:00:00Z`);
  // getUTCDay is Sunday 0, so shift it to Monday 0. Sunday is the end of ITS week, not the start
  // of the next one, which is the off by one this line exists to get right.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Move a week forwards or back. Seven real days, so months and years look after themselves. */
export function shiftWeek(iso: string, deltaWeeks: number): string {
  if (!ISO.test(iso)) return iso;
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaWeeks * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * "3 to 9 Aug 2026", "31 Aug to 6 Sep 2026", "30 Dec to 5 Jan 2031".
 *
 * The month is dropped from the left half only when both ends are in the same one, which cannot
 * happen across a year boundary in seven days, so the year needs stating once and only at the end.
 */
export function weekLabel(mondayIso: string): string {
  if (!ISO.test(mondayIso)) return "";
  const from = new Date(`${mondayIso}T00:00:00Z`);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 6);
  const sameMonth =
    from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear();
  const left = sameMonth
    ? `${from.getUTCDate()}`
    : `${from.getUTCDate()} ${MONTHS_SHORT[from.getUTCMonth()]}`;
  return `${left} to ${to.getUTCDate()} ${MONTHS_SHORT[to.getUTCMonth()]} ${to.getUTCFullYear()}`;
}

/**
 * The seven ISO dates of the week containing this one, Monday first.
 *
 * EMPTY for anything that is not a date, rather than throwing. Caught in review: this was the one
 * exported function here without the guard its three siblings have, and mondayOf hands a bad
 * string straight back, so `new Date("not a date")` reached toISOString and threw RangeError.
 * It is called inside a client component, so a throw takes the whole Planner down rather than
 * degrading. A module whose other functions promise to hand rubbish back must not have one that
 * explodes on it.
 */
export function weekDays(iso: string): string[] {
  if (!ISO.test(iso)) return [];
  const monday = mondayOf(iso);
  return Array.from({ length: 7 }, (_, i) => shiftDays(monday, i));
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
