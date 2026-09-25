/**
 * Be Care Compliant — the Return to Work list on the dashboard (pure, importless, tested).
 *
 * Phil, 2026-09-24: "also need to add return to works on to supervisors and above dashboards",
 * then "List the names". The Absences tile only gave a count; this is who, for which absence,
 * and by when, each opening the Return to Work form on the Absence page.
 */

export type RtwListRow = {
  absenceEventId: string;
  startDate: string;
  endDate: string | null;
  dueDate: string;
  overdue: boolean;
};

/** Overdue first, then the soonest due, then the earliest absence: what needs doing first. */
export function sortRtwForDashboard<T extends RtwListRow>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      a.dueDate.localeCompare(b.dueDate) ||
      a.startDate.localeCompare(b.startDate),
  );
}

function slash(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** "03/08/2026", or "03/08/2026 to 05/08/2026" for more than one day. */
export function rtwAbsenceDates(startIso: string, endIso: string | null): string {
  return endIso && endIso !== startIso ? `${slash(startIso)} to ${slash(endIso)}` : slash(startIso);
}

/** "Overdue 06/08/2026" or "Due 06/08/2026", the same words as the Absence page. */
export function rtwDueLabel(row: { dueDate: string; overdue: boolean }): string {
  return `${row.overdue ? "Overdue" : "Due"} ${slash(row.dueDate)}`;
}

/** Where a dashboard row goes: the Absence page, with that Return to Work form open. */
export function rtwHref(absenceEventId: string): string {
  return `/people/absence?rtw=${encodeURIComponent(absenceEventId)}`;
}

/** The id asked for in ?rtw=, if it looks like one. Anything else opens nothing. */
export function rtwFromSearch(search: string): string | null {
  const v = new URLSearchParams(search).get("rtw") ?? "";
  return /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

/**
 * ABSENCES WAITING FOR A LAST DATE (Phil, 2026-09-24): "when a absence is create, on the day
 * after ... have absences that are waiting for a end date". No last date means no Return to Work
 * can be asked for, so an open absence is the step before one.
 *
 * Listed from the day after the absence began, until a last date is entered.
 *
 * Only absences that BEGAN on or after 24/09/2026, the day this started (Phil, 2026-09-25: "i
 * thought we were only starting last date from yesterday"). The first cut went by when an
 * absence was RECORDED, and four April to June absences typed in just after midnight for the
 * meeting records got through; what an absence is about is its first date, not when someone got
 * round to typing it. The monday history (single days, no last date on purpose) stays quiet.
 */
export const AWAITING_LAST_DATE_FROM = "2026-09-24";

export function isAwaitingLastDate(
  ev: { start_date: string; end_date: string | null; return_date: string | null },
  todayIso: string,
): boolean {
  if (ev.end_date || ev.return_date) return false;
  if (ev.start_date >= todayIso) return false;
  return ev.start_date >= AWAITING_LAST_DATE_FROM;
}

/** "Off since 22/09/2026 · 3 days" (counting the first day). */
export function offSinceLabel(startIso: string, todayIso: string): string {
  const days = Math.round((Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${startIso}T00:00:00Z`)) / 86_400_000) + 1;
  return `Off since ${slash(startIso)} · ${days} day${days === 1 ? "" : "s"}`;
}

/** The Absence page with that person's View absence already open, where the last date goes. */
export function viewAbsenceHref(personId: string): string {
  return `/people/absence?view=${encodeURIComponent(personId)}`;
}

/** The person asked for in ?view=, if it looks like an id. */
export function viewFromSearch(search: string): string | null {
  const v = new URLSearchParams(search).get("view") ?? "";
  return /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}
