/**
 * Be Care Compliant — what the Setup column shows (Phil, 2026-10-14; docs/decisions/setup-due-rule.md).
 *
 * Pure and import free so node --test can load it.
 *
 * Setup is due a set number of days from the package start: "0 days before start", the same day,
 * by default in every company (0471), and the Setup Visit's amber days are 0, so amber is the day
 * itself only. The due date is stored on the check, so the dashboard, readiness, the morning email
 * and the chasers read the same date; this only says how the one Setup cell draws it:
 *
 *   not done, before the due date   green "Due 20 Oct 26"
 *   not done, on the due date       amber "Due 20 Oct 26"
 *   not done, after the due date    red   "Late"
 *   done on or before the due date  the done date, green
 *   done after the due date         the done date, red, for good (a record that it was late)
 *   no package start                nothing, as before
 *   paused (hospital, respite)      "Paused", as before
 *
 * The colour of a not done setup follows public.check_rag exactly (red past the date, amber up to
 * amber days ahead, green beyond), so the cell and every count agree.
 */

export type SetupTone = "green" | "amber" | "red" | "none" | "paused";
export type SetupCell = { tone: SetupTone; text: string; done: boolean };

const isIso = (d: string | null | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "20 Oct 26", the register's date style (lib/people/logic.ts formatDisplayDate). */
export function shortDate(iso: string): string {
  return `${iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(2, 4)}`;
}

export function setupCell(input: {
  packageStart: string | null;
  /** The Setup check's due date (its resume date after a stay away, where it has one). */
  due: string | null;
  completedOn: string | null;
  /** Today in Europe/London, as an ISO date. */
  today: string;
  /** The Setup Visit's amber days (0 by default: amber on the day itself only). */
  amberDays: number | null;
  paused: boolean;
}): SetupCell {
  if (!isIso(input.packageStart)) return { tone: "none", text: "", done: false };
  const due = isIso(input.due) ? input.due : input.packageStart;
  if (isIso(input.completedOn)) {
    return { tone: input.completedOn > due ? "red" : "green", text: shortDate(input.completedOn), done: true };
  }
  if (input.paused) return { tone: "paused", text: "Paused", done: false };
  const ahead = daysBetween(input.today, due);
  if (ahead < 0) return { tone: "red", text: "Late", done: false };
  const amber = input.amberDays ?? 30;
  return { tone: ahead <= amber ? "amber" : "green", text: `Due ${shortDate(due)}`, done: false };
}
