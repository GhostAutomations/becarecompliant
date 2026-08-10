/**
 * Be Care Compliant — who may be told about which overdue invoice.
 *
 * IMPORTLESS ON PURPOSE, so it is the unit test target: `node --experimental-strip-types` resolves
 * neither path aliases nor extensionless files, so one `@/lib/...` import here would break the
 * test run. Date formatting therefore stays with the caller, in cron.ts.
 *
 * The reminder itself runs on the SERVICE ROLE client, which means RLS never applies to it and the
 * branch scoping the register gets for free has to be written out and tested here instead.
 */

/** One overdue invoice as the reminder needs it. */
export type OverdueRow = {
  id: string;
  number: string | null;
  branch_id: string | null;
  due_date: string;
  total_pence: number;
  service_users: { full_name: string } | null;
};

/**
 * The overdue invoices ONE recipient may be told about.
 *
 * Company wide roles (Company Admin, and the Registered roles which getRecipients normalises to
 * company_admin) see everything. A Manager sees only their own branches, and an invoice with NO
 * branch is withheld from them: failing closed on a missing branch is the same posture the
 * evidence policies take. Mirrors overdueForRecipient in lib/notifications/briefings.ts.
 *
 * This list names private clients and what they owe. Before this existed, a Manager of Cardiff and
 * Newport was emailed seven Caerphilly invoices.
 */
export function overdueForRecipient(
  rows: OverdueRow[],
  recipient: { role: string; branchIds: string[] },
): OverdueRow[] {
  /*
   * AN ALLOWLIST, not a denylist. Written the other way round first ("if not a manager, show
   * everything") the safety lived in a Set in another file: add "supervisor" to MANAGER_PLUS, or
   * invent any new role, and every one of them would be emailed every private client's name and
   * amount across the whole company. That is a worse leak than the one this exists to fix.
   */
  if (recipient.role === "company_admin") return rows;
  if (recipient.role !== "manager") return [];
  if (recipient.branchIds.length === 0) return [];
  return rows.filter((r) => r.branch_id != null && recipient.branchIds.includes(r.branch_id));
}

