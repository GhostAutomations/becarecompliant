/*
 * Audit S6 (4 Oct 2026): the session id inside the Supabase auth cookie, read WITHOUT trusting it.
 *
 * Used for one thing only: when the middleware finds no signed-in user, to ask whether the
 * session this browser was holding was ended because the same login signed in on another device
 * (0381), so the sign in page can say so. It grants nothing. A forged cookie can at most choose
 * which message the sign in page shows.
 *
 * Runs in the middleware, so no Buffer: atob and TextDecoder only. The cookie is
 * "sb-<ref>-auth-token", or split into "sb-<ref>-auth-token.0", ".1" and so on when it is long,
 * and its value may be "base64-" followed by base64url JSON (@supabase/ssr cookieEncoding).
 */

const COOKIE = /^sb-[a-z0-9]+-auth-token(?:\.(\d+))?$/;

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sessionIdFromAuthCookies(cookies: Array<{ name: string; value: string }>): string | null {
  try {
    const whole = cookies.find((c) => {
      const m = COOKIE.exec(c.name);
      return m !== null && m[1] === undefined;
    });
    let raw: string | null = whole?.value ?? null;
    if (raw === null) {
      const chunks = cookies
        .map((c) => ({ c, m: COOKIE.exec(c.name) }))
        .filter((x) => x.m && x.m[1] !== undefined)
        .sort((a, b) => Number(a.m![1]) - Number(b.m![1]));
      if (chunks.length === 0) return null;
      raw = chunks.map((x) => x.c.value).join("");
    }
    const json = raw.startsWith("base64-") ? fromBase64Url(raw.slice("base64-".length)) : raw;
    const session = JSON.parse(json) as { access_token?: string };
    const payload = session.access_token?.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(fromBase64Url(payload)) as { session_id?: unknown };
    return typeof claims.session_id === "string" && UUID.test(claims.session_id) ? claims.session_id : null;
  } catch {
    return null;
  }
}
