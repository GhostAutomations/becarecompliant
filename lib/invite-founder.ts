/**
 * Be Care Compliant — the Founder's sign in address is never invited (audit F11, 10 Oct 2026).
 *
 * The one account per email guard (lib/invite-one-account.ts) skipped any login with no company,
 * and the Founder's login has none. So a Company Admin inviting the Founder's address went
 * straight through: the invite minted a sign in token for his account, then the service role
 * moved it into their company as an invited carer or Viewer, and his Founder access ended.
 *
 * Phil, 11 Oct 2026 (popup): the Founder login is changed only directly in the Supabase SQL
 * editor, never from the app, and someone inviting his address reads the message below. It does
 * not say whose login it is. The database refuses the move as well (0444, guard_founder_login).
 *
 * Pure and importless so it can be unit tested.
 */

export const FOUNDER_ADDRESS_REFUSAL =
  "That email address already has a Be Care Compliant login, so it cannot be invited. " +
  "Please use a different email address for this person.";

/** Is this the Founder's login (the platform admin role)? */
export function isFounderLogin(role: string | null | undefined): boolean {
  return role === "platform_admin";
}
