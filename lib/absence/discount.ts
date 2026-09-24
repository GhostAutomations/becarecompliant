/**
 * Be Care Compliant — absence discounting rules (pure, importless, tested).
 *
 * Phil, 2026-09-24: "we need a away to reset abences or restart triggers is some are discounted".
 * A Manager or above can discount one absence (it stays on the record, struck through, and stops
 * counting), restart a person's count from a date (absences AND meetings before it stop counting),
 * and tick the absences a meeting discounted straight after recording it.
 *
 * The database decides what counts (person_absence_summary, 0328) and who may change it
 * (can_discount_absence). These helpers only mirror it so the screens can say the same thing
 * before anyone presses a button.
 */

/** Managers and above (Phil, 2026-09-24). The founder in manage as mode acts as one. */
export const DISCOUNT_ROLES = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "platform_admin",
] as const;

export function canDiscountAbsences(role: string | null | undefined): boolean {
  return (DISCOUNT_ROLES as readonly string[]).includes(role ?? "");
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function discountReasonProblem(reason: string | null | undefined): string | null {
  return (reason ?? "").trim().length < 3 ? "Say why this absence is being discounted." : null;
}

export function restartProblem(input: {
  fromIso: string | null | undefined;
  todayIso: string;
  reason: string | null | undefined;
}): string | null {
  const from = (input.fromIso ?? "").trim();
  if (!ISO.test(from)) return "Choose the date the count restarts from.";
  if (from > input.todayIso) return "The count can only restart from today or an earlier date.";
  if ((input.reason ?? "").trim().length < 3) return "Say why the count is being restarted.";
  return null;
}

function slash(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** The reason offered, and editable, when absences are discounted straight after a meeting. */
export function meetingDiscountReason(stage: number | null, dateIso: string | null): string {
  const what = stage ? `the Stage ${stage} meeting` : "the absence meeting";
  return dateIso && ISO.test(dateIso)
    ? `Discounted at ${what} held on ${slash(dateIso)}`
    : `Discounted at ${what}`;
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

export type CountState = "counted" | "discounted" | "before_restart" | "outside_window";

export function absenceCountState(
  ev: { start_date: string; discounted_at: string | null },
  opts: { restartFrom: string | null; windowStart: string },
): CountState {
  if (ev.discounted_at) return "discounted";
  if (opts.restartFrom && ev.start_date < opts.restartFrom) return "before_restart";
  if (ev.start_date < opts.windowStart) return "outside_window";
  return "counted";
}

/** The absences that count today, oldest first: what a meeting can discount. */
export function countedAbsences<T extends { start_date: string; discounted_at: string | null }>(
  events: T[],
  opts: { restartFrom: string | null; windowStart: string },
): T[] {
  return events
    .filter((e) => absenceCountState(e, opts) === "counted")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}
