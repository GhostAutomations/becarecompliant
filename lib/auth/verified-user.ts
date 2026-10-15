/**
 * Be Care Compliant: sign in checked once per request (speed plan, Phil 2026-10-15, popup "Yes,
 * after the memory change"; docs/decisions/speed-plan.md).
 *
 * Middleware already asks Supabase Auth who the signed in person is on every request
 * (auth.getUser, a network call that checks the token is genuine and the user still exists). The
 * page guard used to ask again a moment later. Now middleware passes the answer on in this request
 * header, and the guard uses it when it matches the session in the same request's cookie.
 *
 * Safe because the header is never taken from the browser: middleware deletes any copy that
 * arrives with the request before it sets its own, and only sets it after Auth has said yes. If it
 * is missing or does not match, the guard asks Auth itself, exactly as before.
 *
 * Importless so it can be unit tested.
 */

export const VERIFIED_USER_HEADER = "x-bcc-verified-user";

/** The user id the guard may trust without asking Auth again: only when middleware's verified id
 *  and the session in this request's cookie are the same person. */
export function trustedUserId(verifiedHeader: string | null | undefined, sessionUserId: string | null | undefined): string | null {
  if (!verifiedHeader || !sessionUserId) return null;
  if (!/^[0-9a-f-]{36}$/i.test(verifiedHeader)) return null;
  return verifiedHeader === sessionUserId ? sessionUserId : null;
}
