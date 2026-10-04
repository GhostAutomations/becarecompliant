/* Audit S5: whether a calendar feed may still be served. Kept apart from calendar-feed.ts,
   which is server-only, so it can be unit tested. */

/** Pure, so it is unit tested: the login is active, still in this company, and the company
 *  is live (active and not deleted). */
export function feedOwnerIsLive(
  owner: { status: string | null; company_id: string | null } | null,
  company: { status: string | null; deleted_at: string | null } | null,
  companyId: string,
): boolean {
  if (!owner || !company) return false;
  if (owner.status !== "active" || owner.company_id !== companyId) return false;
  return company.status === "active" && !company.deleted_at;
}
