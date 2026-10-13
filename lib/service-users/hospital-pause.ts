/**
 * Be Care Compliant — service users in hospital (Phil, 2026-10-13, all companies; 0461).
 *
 * The database decides (su_check_paused and check_effective_due, used by the status views, the
 * rollups, readiness and the senior register). This mirrors the same two rules for the screens and
 * reports that read check_instances directly, and words the pill. Pure and importless, so node
 * --test runs it.
 *
 *   Paused:   service_status is 'hospital', the check has a due date, and it is not a one off
 *             already done (done is never outstanding). No due date stays "none".
 *   Resumed:  on coming out of hospital, a check due before the return date + 7 days is due on
 *             return + 7; later ones keep their dates. Kept beside the due date, never over it.
 */

export const PAUSED = "paused" as const;

function isoAddDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The due date that counts: the resumed one after a hospital stay, when it is later. */
export function effectiveDue(due: string | null | undefined, resume: string | null | undefined): string | null {
  if (!due) return null;
  return resume && due < resume ? resume : due;
}

/** Whether a check is paused because its service user is in hospital. */
export function isPausedCheck(input: {
  serviceStatus: string | null | undefined;
  recurring: boolean | null | undefined;
  lastCompletedOn: string | null | undefined;
  dueDate: string | null | undefined;
}): boolean {
  if (input.serviceStatus !== "hospital") return false;
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

/** The pill, and the words reports print: "Paused: in hospital since 5 October 2026", or without
 *  the date when it is not known. Never "Compliant". */
export function pausedLabel(hospitalSince: string | null | undefined, withDate = true): string {
  return withDate && hospitalSince ? `Paused: in hospital since ${longDate(hospitalSince)}` : "Paused: in hospital";
}

/** Why a return date cannot be saved, or null. */
export function returnDateProblem(returnedOn: string | null | undefined, todayIso: string, hospitalSince?: string | null): string | null {
  if (!returnedOn || !/^\d{4}-\d{2}-\d{2}$/.test(returnedOn)) return "Enter the date they came out of hospital.";
  if (returnedOn > todayIso) return "The date they came out of hospital cannot be in the future.";
  if (hospitalSince && returnedOn < hospitalSince) {
    return `The date they came out of hospital is before the date they went in (${longDate(hospitalSince)}).`;
  }
  return null;
}
