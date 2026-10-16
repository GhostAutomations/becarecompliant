/**
 * Be Care Compliant — the personal Recent activity tile and the completion email (Phil,
 * 2026-10-14; docs/decisions/personal-notifications.md).
 *
 * Pure and import free so node --test can load it. What a notification says and where it opens.
 * The rows themselves are made by the database (0473, notify_check_completed) and read by each
 * person through RLS: their own only.
 */

export type ActivityRow = {
  id: string;
  checkName: string;
  recordName: string | null;
  recordKind: "person" | "service_user";
  recordId: string;
  evidenceId: string | null;
  actorName: string | null;
  branchName: string | null;
  completedOn: string | null;
  createdAt: string;
  /** A concern raised in a care note (Rota and Visits Stage 5) rather than a completed check. */
  concernId?: string | null;
};

/** "Care Plan Review completed". */
export function activityTitle(checkName: string): string {
  return `${checkName} completed`;
}

/** The line's title: "Care Plan Review completed", or "Concern raised in a care note" (Stage 5). */
export function activityRowTitle(row: Pick<ActivityRow, "checkName" | "concernId">): string {
  return row.concernId ? "Concern raised in a care note" : activityTitle(row.checkName);
}

/** Opens the concern, else the Evidence when there is one, otherwise the record. */
export function activityHref(row: Pick<ActivityRow, "evidenceId" | "recordKind" | "recordId" | "concernId">): string {
  if (row.concernId) return `/rota/concerns?concern=${row.concernId}`;
  if (row.evidenceId) return `/evidence/${row.evidenceId}`;
  return row.recordKind === "person" ? `/people/${row.recordId}` : `/service-users/${row.recordId}`;
}

export function recordHref(row: Pick<ActivityRow, "recordKind" | "recordId">): string {
  return row.recordKind === "person" ? `/people/${row.recordId}` : `/service-users/${row.recordId}`;
}

/** "for A Person, by A Carer, Swansea": the parts that are known, comma separated. No dashes. */
export function activityDetail(row: Pick<ActivityRow, "recordName" | "actorName" | "branchName">): string {
  return [row.recordName ? `for ${row.recordName}` : "", row.actorName ? `by ${row.actorName}` : "", row.branchName ?? ""]
    .filter(Boolean)
    .join(", ");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 Oct 2026, 09:05" in London; "Today, 09:05" when it is today in London. */
export function activityWhen(iso: string, now: Date = new Date()): string {
  const parts = (d: Date) => {
    const f = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const g = (t: string) => f.find((p) => p.type === t)?.value ?? "";
    return { y: g("year"), m: g("month"), d: g("day"), hh: g("hour"), mm: g("minute") };
  };
  const a = parts(new Date(iso));
  const b = parts(now);
  const time = `${a.hh}:${a.mm}`;
  if (a.y === b.y && a.m === b.m && a.d === b.d) return `Today, ${time}`;
  return `${+a.d} ${MONTHS[+a.m - 1]} ${a.y}, ${time}`;
}

/** The roles that can open other people's checks, and so can be notified (rule 5). */
export const NOTIFIABLE_ROLES = [
  "company_admin",
  "registered_individual",
  "registered_manager",
  "manager",
  "supervisor",
  "recruiter",
] as const;

/** Roles whose reach is the whole company: no branch list to manage. */
export const WHOLE_COMPANY_ROLES = ["company_admin", "registered_individual", "registered_manager", "recruiter"] as const;

export function canBeNotified(role: string): boolean {
  return (NOTIFIABLE_ROLES as readonly string[]).includes(role);
}
export function coversWholeCompany(role: string): boolean {
  return (WHOLE_COMPANY_ROLES as readonly string[]).includes(role);
}

/** The email subject: "Care Plan Review completed for A Person". */
export function completionEmailSubject(checkName: string, recordName: string | null): string {
  return recordName ? `${activityTitle(checkName)} for ${recordName}` : activityTitle(checkName);
}

/** "14 Oct 2026" from "2026-10-14". */
export function displayDate(iso: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  return `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
}
