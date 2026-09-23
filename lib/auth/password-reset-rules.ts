/**
 * Be Care Compliant - the rules for getting back in after a forgotten password. Pure and
 * IMPORTLESS, so node --test can load it.
 *
 * WHY IT EXISTS (Phil, 2026-09-23). There was no way back from a forgotten password. No link on
 * the sign in page, and no button an Admin could press: a Thistle manager who forgot hers could
 * only get in through the Founder in the Supabase dashboard, and found out during testing when
 * the Founder himself could not sign in as his own test Manager. By this phase's own rule,
 * anything only the Founder can put right by hand is a defect.
 *
 * THE DECISIONS (popup, 2026-09-23): both a "Forgot your password?" link and an Admin "Send
 * password reset" button, sending the same branded email; and a new password signs the person
 * out everywhere else, because a reset is often because somebody else may know the old one.
 */

/** One reset email per account per this many minutes, however many times the form is sent. */
export const RESET_THROTTLE_MINUTES = 10;

/**
 * What the public form says, WHATEVER happened.
 *
 * The same sentence whether the address has an account, has none, is disabled, or was throttled.
 * Anything else lets a stranger type addresses into the form and learn which ones are staff at a
 * care company, which is a list of names worth having for somebody running a phishing campaign.
 */
export const FORGOT_REPLY =
  "If that address has a Be Care Compliant account, a reset link is on its way. Check your inbox, and your junk folder. The link works once.";

/** Trim and lower case, the way every address is stored. */
export function normaliseEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Is this worth looking up at all? */
export function looksLikeEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

/**
 * Who can be sent a reset. Only a live account.
 *
 * - invited: has never set a password, so a reset is the wrong door. Their invitation is.
 * - disabled: an Admin switched them off. A reset would let them set a password on a login
 *   they still cannot use, and would look to them like the switch had been undone.
 */
export function canReceiveReset(status: string | null | undefined): boolean {
  return status === "active";
}

/** Was a reset sent to this account too recently to send another? */
export function resetThrottled(lastSentIso: string | null | undefined, nowMs: number): boolean {
  if (!lastSentIso) return false;
  const last = Date.parse(lastSentIso);
  if (Number.isNaN(last)) return false;
  return nowMs - last < RESET_THROTTLE_MINUTES * 60_000;
}

/**
 * The new password rule. The SAME as setting one from an invitation (at least 8 characters, typed
 * twice), so a manager is never told a password is fine in one place and too short in the other.
 */
export function newPasswordProblem(password: string, confirm: string): string | null {
  if (password.length < 8) return "Choose a password of at least 8 characters.";
  if (password !== confirm) return "The passwords do not match.";
  return null;
}

/** Where a used or expired reset link lands, so it says why rather than "no access". */
export const RESET_EXPIRED_PATH = "/login/forgot?reason=expired";

/** Where the reset link sends somebody once the token is accepted. */
export const RESET_FORM_PATH = "/login/reset";

/** How long after opening a reset link the new password form stays usable. */
export const RECOVERY_WINDOW_MINUTES = 15;

/**
 * Did THIS session come from a reset link, recently?
 *
 * FOUND IN TESTING, 2026-09-23. /login/reset worked for anybody already signed in, whatever way
 * they had signed in. So anybody at an unlocked, signed in computer could open it, set a new
 * password without knowing the old one, and sign the real owner out everywhere: a takeover in two
 * clicks. The form is only for somebody who has just proved they own the inbox, which the session
 * records as an amr entry with method "recovery" and the time it happened.
 */
export function cameFromRecovery(
  amr: ReadonlyArray<{ method: string; timestamp: number }>,
  nowMs: number,
): boolean {
  return amr.some(
    (a) =>
      a.method === "recovery" &&
      nowMs - a.timestamp * 1000 <= RECOVERY_WINDOW_MINUTES * 60_000 &&
      a.timestamp * 1000 <= nowMs + 60_000,
  );
}

/**
 * How a session was signed in: the access token's amr claim, e.g. [{ method: "recovery", ... }].
 *
 * Decoded with atob, not Buffer, because the middleware runs on the edge where Buffer is not
 * guaranteed. Only ever read after supabase.auth.getUser() (or the middleware's own getUser) has
 * accepted the same token, which is what checks the signature.
 */
export function amrFromAccessToken(
  accessToken: string | null | undefined,
): Array<{ method: string; timestamp: number }> {
  try {
    const part = (accessToken ?? "").split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const payload = JSON.parse(atob(b64)) as { amr?: Array<{ method?: unknown; timestamp?: unknown }> };
    return (payload.amr ?? [])
      .filter((a) => typeof a.method === "string" && typeof a.timestamp === "number")
      .map((a) => ({ method: a.method as string, timestamp: a.timestamp as number }));
  } catch {
    return [];
  }
}

/**
 * Is this a session made by opening a reset link?
 *
 * SUCH A SESSION CAN DO ONE THING: set a new password (Phil, popup 2026-09-23). Opening a reset
 * email used to sign the person fully in before they had chosen a password, so "Back to sign in"
 * dropped him on the dashboard and anybody who abandoned the form was simply in the app. Now every
 * app page sends a reset session back to the form, and saving the password ends it: they sign in
 * fresh with the new one.
 */
export function isRecoverySession(amr: ReadonlyArray<{ method: string }>): boolean {
  return amr.some((a) => a.method === "recovery");
}
