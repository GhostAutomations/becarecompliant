/**
 * Dates on a person's record that are not checks but still run out: a DBS renewal and a Right
 * to Work expiry. Pure, so the rule the morning report uses can be tested on its own.
 *
 * WHY THESE NEED THEIR OWN READ. The daily reports read person_check_status, which is CHECK
 * instances. These dates live on person_trackers, so without this nothing would ever chase
 * them: the register would colour the cell and nobody would be told (DBS, 2026-09-22; Right to
 * Work, DEF-071, 2026-09-24).
 *
 * THE WINDOW is the company's own where it has given itself a check definition for the date,
 * and the product's default otherwise: the identical rule the register colours by, so the
 * email and the screen can never disagree about what amber means.
 */

export type TrackerDateRow = { personId: string; branchId: string | null; date: string };
export type TrackerPerson = { id: string; fullName: string; employmentStatus: string | null; archivedAt: string | null };

export type TrackerDateAlert = {
  personId: string;
  personName: string;
  branchId: string | null;
  date: string;
};

/** ISO date N days after an ISO date (civil, timezone free). */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** The rows inside the amber window or already past, for active people only, soonest first. */
export function datesToChase(rows: TrackerDateRow[], todayIso: string, amberDays: number): TrackerDateRow[] {
  const horizon = addDaysIso(todayIso, amberDays);
  return rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.date <= horizon);
}

/**
 * Join the wanted rows to their people. A leaver's or an archived record's date is nobody's
 * problem, so those are dropped, and so is a row whose person could not be read.
 */
export function trackerDateAlerts(rows: TrackerDateRow[], people: TrackerPerson[]): TrackerDateAlert[] {
  const active = new Map(
    people.filter((p) => p.archivedAt === null && p.employmentStatus !== "leaver").map((p) => [p.id, p.fullName]),
  );
  return rows
    .filter((r) => active.has(r.personId))
    .map((r) => ({ personId: r.personId, personName: active.get(r.personId) as string, branchId: r.branchId, date: r.date }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.personName.localeCompare(b.personName));
}
