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
