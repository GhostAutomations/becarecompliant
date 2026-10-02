/**
 * THE RESET MARKER (DEF-105, 2 Oct 2026).
 *
 * The reset form used to recognise a session made by a reset link from the access token's amr
 * claim, method "recovery". Supabase does not write that for a link checked with verifyOtp and a
 * token_hash: it writes "otp", the same as a sign in link. So every reset link signed the person
 * in and then said "That reset link has expired" (found 2 Oct, Phil, R7; the auth log shows the
 * verify succeeding and the session's amr is "otp"). Worse, the session was then a full sign in
 * that had never been asked for a password.
 *
 * So /auth/confirm, when it has just checked a RECOVERY token, sets this cookie: an HMAC of the new
 * session's id and the time, keyed with a server only secret. Then:
 *   - the reset form and its action accept the session only while the marker is fresh (15 minutes);
 *   - every app page, and the sign in page, treat a session carrying a marker as "reset only", fresh
 *     or not, so abandoning the form never leaves somebody signed in without a password;
 *   - saving the new password ends the session and clears the cookie.
 *
 * Web Crypto, not node:crypto, because the middleware runs on the edge.
 */

export const RESET_MARKER_COOKIE = "bcc_reset";
/** Kept as long as a session could live, so an abandoned reset session stays reset only. */
export const RESET_MARKER_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
/** How long the form accepts a reset session. The same 15 minutes as before. */
export const RESET_MARKER_FRESH_MINUTES = 15;

function secret(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(message: string): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)));
}

/** The session id inside an access token (edge safe; only read after getUser accepted the token). */
export function sessionIdOf(accessToken: string | null | undefined): string | null {
  try {
    const part = (accessToken ?? "").split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const payload = JSON.parse(atob(b64)) as { session_id?: unknown };
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

export async function makeResetMarker(sessionId: string, nowMs: number = Date.now()): Promise<string | null> {
  const iat = Math.floor(nowMs / 1000);
  const sig = await sign(`${sessionId}.${iat}`);
  return sig ? `${iat}.${sig}` : null;
}

/** Does the cookie belong to THIS session? Null when there is no valid marker for it. */
async function markerAge(value: string | null | undefined, sessionId: string | null, nowMs: number): Promise<number | null> {
  if (!value || !sessionId) return null;
  const [iatRaw, sig] = value.split(".");
  const iat = Number(iatRaw);
  if (!Number.isFinite(iat) || !sig) return null;
  const expected = await sign(`${sessionId}.${iat}`);
  if (!expected || expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  return nowMs - iat * 1000;
}

/** A session made by a reset link, however long ago: it may only reach the reset form. */
export async function isResetSession(value: string | null | undefined, accessToken: string | null | undefined, nowMs: number = Date.now()): Promise<boolean> {
  return (await markerAge(value, sessionIdOf(accessToken), nowMs)) !== null;
}

/** A session made by a reset link in the last 15 minutes: the form may set its password. */
export async function isFreshResetSession(value: string | null | undefined, accessToken: string | null | undefined, nowMs: number = Date.now()): Promise<boolean> {
  const age = await markerAge(value, sessionIdOf(accessToken), nowMs);
  return age !== null && age >= -60_000 && age <= RESET_MARKER_FRESH_MINUTES * 60_000;
}
