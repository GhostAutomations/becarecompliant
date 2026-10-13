/**
 * Be Care Compliant — service users in hospital or on respite (Phil, 2026-10-13, all companies;
 * 0461 for hospital, 0462 "Let's do the same for respite").
 *
 * The database decides (su_check_paused and check_effective_due, used by the status views, the
 * rollups, readiness and the senior register). This mirrors the same two rules for the screens and
 * reports that read check_instances directly, and words the pill. Pure and importless, so node
 * --test runs it.
 *
 *   Paused:   service_status is 'hospital' or 'respite', the check has a due date, and it is not
 *             a one off already done (done is never outstanding). No due date stays "none".
 *   Resumed:  on coming back to Active, a check due before the return date + 7 days is due on
 *             return + 7; later ones keep their dates. Kept beside the due date, never over it.
 *   Between:  moving straight from hospital to respite (or back) keeps the pause; the "since" date
 *             restarts on the day of the move (Phil's popup).
 */

export const PAUSED = "paused" as const;

/** The statuses that pause a service user's checks. */
export const AWAY_STATUSES: readonly string[] = ["hospital", "respite"];

export function isAway(status: string | null | undefined): boolean {
  return AWAY_STATUSES.includes(status ?? "");
}

/** "in hospital" or "in respite", for the pill and the reports. */
export function awayWords(status: string | null | undefined): string {
  return status === "respite" ? "in respite" : "in hospital";
}

function isoAddDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The due date that counts: the resumed one after a hospital stay, when it is later. */
export function effectiveDue(due: string | null | undefined, resume: string | null | undefined): string | null {
  if (!due) return null;
  return resume && due < resume ? resume : due;
}

/** Whether a check is paused because its service user is in hospital or on respite. */
export function isPausedCheck(input: {
  serviceStatus: string | null | undefined;
  recurring: boolean | null | undefined;
  lastCompletedOn: string | null | undefined;
  dueDate: string | null | undefined;
}): boolean {
  if (!isAway(input.serviceStatus)) return false;
  if (!input.dueDate) return false;
  if (input.recurring === false && input.lastCompletedOn) return false;
  return true;
}

/** Rule 2: the resumed due date for a check, given the day they came out of hospital, or null
 *  when the check keeps its own date. */
export function resumeDueFor(input: {
  dueDate: string | null | undefined;
  resumeDueDate?: string | null;
  recurring: boolean | null | undefined;
  lastCompletedOn: string | null | undefined;
  returnedOn: string;
}): string | null {
  if (!input.dueDate) return null;
  if (input.recurring === false && input.lastCompletedOn) return null;
  const resume = isoAddDays(input.returnedOn, 7);
  const current = effectiveDue(input.dueDate, input.resumeDueDate ?? null) as string;
  return current < resume ? resume : input.resumeDueDate ?? null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "5 October 2026". */
export function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** The pill, and the words reports print: "Paused: in hospital since 5 October 2026", "Paused: in
 *  respite", or without the date when it is not known. Never "Compliant". */
export function pausedLabel(since: string | null | undefined, status: string | null | undefined = "hospital", withDate = true): string {
  const where = awayWords(status);
  return withDate && since ? `Paused: ${where} since ${longDate(since)}` : `Paused: ${where}`;
}

/** The question asked when they come back. */
export function returnQuestion(status: string | null | undefined): string {
  return status === "respite" ? "Date they came back from respite" : "Date they came out of hospital";
}

/** Why a return date cannot be saved, or null. */
export function returnDateProblem(
  returnedOn: string | null | undefined,
  todayIso: string,
  since?: string | null,
  status: string | null | undefined = "hospital",
): string | null {
  const what = status === "respite" ? "the date they came back from respite" : "the date they came out of hospital";
  const What = what.charAt(0).toUpperCase() + what.slice(1);
  if (!returnedOn || !/^\d{4}-\d{2}-\d{2}$/.test(returnedOn)) return `Enter ${what}.`;
  if (returnedOn > todayIso) return `${What} cannot be in the future.`;
  if (since && returnedOn < since) {
    return `${What} is before the date they went in (${longDate(since)}).`;
  }
  return null;
}
