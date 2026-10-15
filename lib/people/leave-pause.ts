/**
 * Be Care Compliant: staff on Parental Leave or Long Term Sick (Phil, 2026-10-15, all companies;
 * 0484; docs/decisions/leave-pause.md). The same rules as service users in hospital or on respite
 * (lib/service-users/hospital-pause.ts, 0461, 0462), for People.
 *
 * The database decides for checks (person_check_paused and check_effective_due, used by the status
 * views, the rollups, Readiness and the register read). This mirrors the rules for the screens and
 * reports that work in TypeScript, words the badge and the pill, and holds the training rule,
 * which only exists in TypeScript (lib/training/data.ts). Importless apart from the service user
 * module it mirrors, so node --test runs it.
 *
 *   Paused:   employment_status is 'mat_leave' (shown as Parental Leave) or 'lts', the check has a
 *             due date, and it is not a one off already done. Legal expiries (Right to Work, DBS)
 *             are tracker dates, not checks, and are never paused.
 *   Resumed:  on coming back to Active, a check due before the return date + 7 days is due on
 *             return + 7; later ones keep their dates.
 *   Training: the same. While on leave every course still to do is paused (a one off already done
 *             stays done); after coming back, a renewal due before return + 7 is due on return + 7,
 *             and a course never done is due on return + 7 too.
 */

import { effectiveDue, longDate } from "../service-users/hospital-pause.ts";

export { effectiveDue };

/** The statuses that pause a person's checks. */
export const LEAVE_STATUSES: readonly string[] = ["mat_leave", "lts"];

export function isOnLeave(status: string | null | undefined): boolean {
  return LEAVE_STATUSES.includes(status ?? "");
}

/** The badge beside the name on the register: "PL" or "LTS" (Phil's wording). */
export function leaveBadge(status: string | null | undefined): string | null {
  if (status === "mat_leave") return "PL";
  if (status === "lts") return "LTS";
  return null;
}

/** "on parental leave" or "on long term sick". */
export function leaveWords(status: string | null | undefined): string {
  return status === "lts" ? "on long term sick" : "on parental leave";
}

/** The pill and the words reports print: "Paused: on parental leave since 15 October 2026". */
export function leavePausedLabel(since: string | null | undefined, status: string | null | undefined, withDate = true): string {
  const where = leaveWords(status);
  return withDate && since ? `Paused: ${where} since ${longDate(since)}` : `Paused: ${where}`;
}

/** Whether a check is paused because its person is on leave (person_check_paused, 0484). */
export function isPausedPersonCheck(input: {
  employmentStatus: string | null | undefined;
  recurring: boolean | null | undefined;
  lastCompletedOn: string | null | undefined;
  dueDate: string | null | undefined;
}): boolean {
  if (!isOnLeave(input.employmentStatus)) return false;
  if (!input.dueDate) return false;
  if (input.recurring === false && input.lastCompletedOn) return false;
  return true;
}

function isoAddDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The day paused work falls due after coming back: return + 7. */
export function resumeDate(returnedOn: string): string {
  return isoAddDays(returnedOn, 7);
}

/**
 * A worked out cycle slot (a supervision, LTL or appraisal still to do), which the register and
 * the record draw from completion dates rather than from a check: paused while on leave, and
 * after coming back due no sooner than return + 7, coloured by ragFor (the screen's own rule).
 * Shared by the People Matrix and the record, so the two cannot disagree.
 */
export function leaveSlot(
  due: string | null,
  rag: string,
  person: { employmentStatus: string | null | undefined; leaveReturnedOn: string | null | undefined },
  ragFor: (date: string) => string,
): { due: string | null; rag: string } {
  if (!due) return { due, rag };
  if (isOnLeave(person.employmentStatus)) return { due, rag: "paused" };
  if (person.employmentStatus === "active" && person.leaveReturnedOn) {
    const resume = resumeDate(person.leaveReturnedOn);
    if (due < resume) return { due: resume, rag: ragFor(resume) };
  }
  return { due, rag };
}

/** The question asked when they come back. */
export function leaveReturnQuestion(status: string | null | undefined): string {
  return status === "lts" ? "Date they came back from long term sick" : "Date they came back from parental leave";
}

/** Why a return date cannot be saved, or null (the same words as the database, 0484). */
export function leaveReturnDateProblem(
  returnedOn: string | null | undefined,
  todayIso: string,
  since?: string | null,
  status?: string | null,
): string | null {
  const what = status === "lts" ? "the date they came back from long term sick" : "the date they came back from parental leave";
  const What = what.charAt(0).toUpperCase() + what.slice(1);
  if (!returnedOn || !/^\d{4}-\d{2}-\d{2}$/.test(returnedOn)) return `Enter ${what}.`;
  if (returnedOn > todayIso) return `${What} cannot be in the future.`;
  if (since && returnedOn < since) return `${What} is before the date their leave began (${longDate(since)}).`;
  return null;
}

/**
 * Training while on leave and after. Given the person and the course record, says whether the
 * cell is paused, and otherwise which expiry date counts (the resumed one, when later).
 *   - On leave: paused, unless it is a one off already done.
 *   - Back from leave: a renewal before return + 7 counts as return + 7; a course never done
 *     counts as due on return + 7 until that day has passed (graceUntil).
 */
export function trainingLeave(input: {
  employmentStatus: string | null | undefined;
  leaveReturnedOn: string | null | undefined;
  done: boolean;
  oneOff: boolean;
  expiryOn: string | null | undefined;
  todayIso: string;
}): { paused: boolean; expiryOn: string | null; graceUntil: string | null } {
  const expiry = input.expiryOn ?? null;
  if (isOnLeave(input.employmentStatus)) {
    return { paused: !(input.oneOff && input.done), expiryOn: expiry, graceUntil: null };
  }
  if (input.employmentStatus !== "active" || !input.leaveReturnedOn) {
    return { paused: false, expiryOn: expiry, graceUntil: null };
  }
  const resume = resumeDate(input.leaveReturnedOn);
  if (!input.done) {
    return { paused: false, expiryOn: expiry, graceUntil: input.todayIso <= resume ? resume : null };
  }
  if (input.oneOff || !expiry) return { paused: false, expiryOn: expiry, graceUntil: null };
  return { paused: false, expiryOn: expiry < resume ? resume : expiry, graceUntil: null };
}
