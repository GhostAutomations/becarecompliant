/**
 * Be Care Compliant — one login account per email address (DEF-009).
 *
 * Found 2026-08-19: the invite guard refused an address only when it was ACTIVE in another
 * company. An address merely invited there fell through, and the invite then overwrote the
 * account's company and role, so a second company inviting the same email silently moved the
 * account away from the first, whose own invitation became a link into a company that person was
 * no longer part of. Nobody was told at either end.
 *
 * Phil, 2026-09-23: "only one account per email, if they want to be on 2 companies, they must use
 * a seperate email." So an address that belongs to another company in ANY state (invited, active,
 * or a leaver whose login was closed) is refused, and the Admin is told to use a different
 * address. Moving it would also have taken the account out of the first company's history: the
 * Evidence, meetings and bookings it signed are named by looking the account up in THAT company.
 *
 * The one exception is a company that no longer exists (purged, so the lookup finds nothing) or
 * has been deleted and is waiting out its grace period: nobody is left there to lose the account.
 *
 * Pure and importless so it can be unit tested.
 */

export const ONE_ACCOUNT_REFUSAL =
  "That email address already has an account with another company. One email address can only " +
  "belong to one company, so please use a different email address for this person.";

export function belongsToAnotherCompany(input: {
  /** The company the account is in now, or null for a fresh account. */
  existingCompanyId: string | null | undefined;
  /** That company's status, or null when the company row no longer exists. */
  existingCompanyStatus: string | null | undefined;
  /** The company doing the inviting. */
  targetCompanyId: string;
}): boolean {
  if (!input.existingCompanyId) return false;
  if (input.existingCompanyId === input.targetCompanyId) return false;
  if (input.existingCompanyStatus == null) return false; // purged: nothing left to belong to
  if (input.existingCompanyStatus === "deleted") return false;
  return true;
}
