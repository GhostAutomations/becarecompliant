/**
 * Be Care Compliant — when "manage as company" must stop pointing at a company (DEF-013).
 *
 * A company that has been deleted (status "deleted", waiting out its grace period) or purged (no
 * row at all, which the caller treats the same way) is not somewhere the founder can be working
 * inside. Pure and importless so it can be unit tested.
 */
export function actingCompanyGone(status: string | null | undefined): boolean {
  return status === "deleted";
}
