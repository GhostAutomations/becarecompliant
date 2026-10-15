/**
 * Be Care Compliant — holiday blackout dates (0477, Phil 2026-10-15; docs/decisions/holiday-blackouts.md).
 *
 * Pure and import free so node --test can load it. The database decides whether a holiday may be
 * saved (holiday_blackout_clash, on every insert and date change); this draws the same rule on
 * the screens: the calendar shading, the "Clashes with blackout" pill, the list of who already
 * has holiday in a new blackout, and the words, which match holiday_blackout_message exactly.
 * Whole days, inclusive, as ISO dates; dates are London dates already.
 */

export type Blackout = {
  id: string;
  start: string;
  end: string;
  reason: string;
  allBranches: boolean;
  branchIds: string[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dm = (iso: string) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
const dmy = (iso: string) => `${dm(iso)} ${iso.slice(0, 4)}`;

/** "20 Dec to 2 Jan 2027", or "11 Nov 2026" for one day. */
export function blackoutDates(start: string, end: string): string {
  return start === end ? dmy(start) : `${dm(start)} to ${dmy(end)}`;
}

/** The exact words the database refuses with. */
export function blackoutMessage(b: Pick<Blackout, "start" | "end" | "reason">): string {
  return b.start === b.end
    ? `Holidays can't be booked on ${dmy(b.start)}: ${b.reason.trim()}.`
    : `Holidays can't be booked ${dm(b.start)} to ${dmy(b.end)}: ${b.reason.trim()}.`;
}

export function overlapsDates(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Does this blackout cover a holiday in this branch? A holiday with no branch meets only "All branches". */
export function blackoutAppliesTo(b: Blackout, branchId: string | null): boolean {
  return b.allBranches || (branchId !== null && b.branchIds.includes(branchId));
}

/** The first blackout these days fall in for this branch, as the database picks it. */
export function blackoutClash(blackouts: Blackout[], branchId: string | null, start: string, end: string): Blackout | null {
  const hits = blackouts
    .filter((b) => blackoutAppliesTo(b, branchId) && overlapsDates(b.start, b.end, start, end))
    .sort((a, b) => (a.start === b.start ? a.end.localeCompare(b.end) : a.start.localeCompare(b.start)));
  return hits[0] ?? null;
}

/** Blackouts on one day of the calendar. With a branch chosen, only those covering it; with all
 *  branches showing, every one (its branches are named in the tooltip). */
export function blackoutsOn(blackouts: Blackout[], dayIso: string, branchId: string | null): Blackout[] {
  return blackouts.filter((b) => b.start <= dayIso && dayIso <= b.end && (branchId === null || blackoutAppliesTo(b, branchId)));
}

/** Upcoming blackouts (not yet over) for a person's branch, soonest first: the staff portal's list. */
export function upcomingFor(blackouts: Blackout[], branchId: string | null, todayIso: string): Blackout[] {
  return blackouts
    .filter((b) => b.end >= todayIso && blackoutAppliesTo(b, branchId))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export type HolidayLite = {
  id: string;
  name: string | null;
  branchId: string | null;
  start: string;
  end: string;
  status: string;
};

/** Who already has approved or pending holiday inside a blackout being made or changed. */
export function affectedBy(
  draft: { start: string; end: string; allBranches: boolean; branchIds: string[] },
  holidays: HolidayLite[],
): HolidayLite[] {
  if (!draft.start || !draft.end || draft.end < draft.start) return [];
  const b: Blackout = { id: "draft", reason: "", ...draft };
  return holidays
    .filter((h) => (h.status === "approved" || h.status === "pending") && blackoutAppliesTo(b, h.branchId) && overlapsDates(h.start, h.end, draft.start, draft.end))
    .sort((a, c) => a.start.localeCompare(c.start));
}
