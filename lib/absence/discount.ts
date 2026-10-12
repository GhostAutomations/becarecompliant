/**
 * Be Care Compliant — absence discounting rules (pure, importless, tested).
 *
 * Phil, 2026-09-24: "we need a away to reset abences or restart triggers is some are discounted".
 * A Manager or above can discount one absence (it stays on the record, struck through, and stops
 * counting) and tick the absences a meeting discounted straight after recording it. There is no
 * "restart the count": meetings age out with the rolling window on their own (0329, Phil: "i think
 * it needs to be automatic").
 *
 * The database decides what counts (person_absence_summary, 0329) and who may change it
 * (can_discount_absence). These helpers only mirror it so the screens can say the same thing
 * before anyone presses a button.
 */

/** Managers and above (Phil, 2026-09-24). The founder in manage as mode acts as one. Since
 *  2026-10-08 Supervisors hold absence meetings (Phil, for Thistle), and discounting is part of
 *  the meeting, so they discount too, for their own branch (can_discount_absence, 0431). */
export const DISCOUNT_ROLES = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "platform_admin",
  "supervisor",
] as const;

export function canDiscountAbsences(role: string | null | undefined): boolean {
  return (DISCOUNT_ROLES as readonly string[]).includes(role ?? "");
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function discountReasonProblem(reason: string | null | undefined): string | null {
  return (reason ?? "").trim().length < 3 ? "Say why this absence is being discounted." : null;
}

function slash(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** The reason offered, and editable, when absences are discounted straight after a meeting.
 *  Not "Discounted at...": it is always shown beside the word Discounted, so it said it twice. */
export function meetingDiscountReason(stage: number | null, dateIso: string | null): string {
  const what = stage ? `the Stage ${stage} meeting` : "the absence meeting";
  return dateIso && ISO.test(dateIso)
    ? `Agreed at ${what} held on ${slash(dateIso)}`
    : `Agreed at ${what}`;
}

export type WindowLike = { value: number; unit: "day" | "week" | "month" };

/**
 * The first date inside the rolling window, the same way Postgres works out
 * current_date - interval 'N month': the day of the month is kept where it exists and pulled back
 * to the last day of a shorter month (31 Aug less 6 months is 28 Feb, or 29 Feb in a leap year).
 */
export function windowStartIso(todayIso: string, window: WindowLike): string {
  const [y, m, d] = todayIso.split("-").map(Number);
  if (window.unit === "month") {
    const total = y * 12 + (m - 1) - window.value;
    const ny = Math.floor(total / 12);
    const nm = total - ny * 12; // 0 based
    const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    const nd = Math.min(d, last);
    return `${String(ny).padStart(4, "0")}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
  }
  const days = window.unit === "week" ? window.value * 7 : window.value;
  const t = new Date(Date.UTC(y, m - 1, d) - days * 86_400_000);
  return t.toISOString().slice(0, 10);
}

export type CountState = "counted" | "discounted" | "outside_window";

export function absenceCountState(
  ev: { start_date: string; discounted_at: string | null },
  opts: { windowStart: string },
): CountState {
  if (ev.discounted_at) return "discounted";
  if (ev.start_date < opts.windowStart) return "outside_window";
  return "counted";
}

/** The absences that count today, oldest first: what a meeting can discount. */
export function countedAbsences<T extends { start_date: string; discounted_at: string | null }>(
  events: T[],
  opts: { windowStart: string },
): T[] {
  return events
    .filter((e) => absenceCountState(e, opts) === "counted")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** The meeting date a discount reason names ("...meeting held on 10/07/2026" or "held on 10th July
 *  2026"), as yyyy-mm-dd, or null. */
export function meetingDateInReason(reason: string | null | undefined): string | null {
  const t = String(reason ?? "");
  const slash = /held on (\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(t);
  if (slash) return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
  const words = /held on (\d{1,2})(?:st|nd|rd|th)? ([a-z]+) (\d{4})/i.exec(t);
  if (words) {
    const m = MONTH_NAMES.indexOf(words[2].toLowerCase());
    if (m >= 0) return `${words[3]}-${String(m + 1).padStart(2, "0")}-${words[1].padStart(2, "0")}`;
  }
  return null;
}

/**
 * The absences discounted AT a meeting (Phil, 2026-10-12), for its letter's "discounted at this
 * meeting". A reason that names a meeting date decides it; otherwise one discounted on or after the
 * meeting day and before the person's next meeting. So a discount made at a later meeting is never
 * claimed by an earlier one, and one entered afterwards for this meeting (Thistle's back entered
 * meetings, discounted by hand the next day) still belongs to it.
 */
export function discountedAtMeeting<T extends { discounted_at: string | null; discount_reason?: string | null }>(
  events: T[],
  meetingDay: string | null | undefined,
  nextMeetingDay?: string | null,
): T[] {
  if (!meetingDay || !/^\d{4}-\d{2}-\d{2}$/.test(meetingDay)) return [];
  return events.filter((e) => {
    if (!e.discounted_at) return false;
    const named = meetingDateInReason(e.discount_reason);
    if (named) return named === meetingDay;
    const day = e.discounted_at.slice(0, 10);
    return day >= meetingDay && (!nextMeetingDay || day < nextMeetingDay);
  });
}
