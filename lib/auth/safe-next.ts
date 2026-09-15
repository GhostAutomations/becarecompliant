/**
 * Where to send somebody after they sign in.
 *
 * WHY THIS EXISTS (Phil, 2026-09-15). He tapped a supervision link from his iPhone calendar and
 * landed on the Dashboard. The link was right; the sign-in threw it away. Middleware redirected
 * to /login and cleared the path, and signIn always finished at /dashboard, so EVERY deep link
 * into BCC behaved this way: calendar links, links in emails we send, a bookmark, a link a
 * colleague pastes in a message. The person arrives somewhere they did not ask for and has to
 * find the job by hand, which is the thing the link existed to save them.
 *
 * WHY IT IS ITS OWN MODULE. This value arrives in a URL and again in a hidden form field, both
 * of which anyone can write. Turning "where did they want to go" into a destination is an open
 * redirect waiting to happen: //evil.example is a protocol-relative URL that leaves the site
 * entirely, and a browser will follow it. The rules are small, easy to get wrong, and worth
 * testing on their own rather than trusting twice in two different files.
 *
 * WHAT IS ALLOWED: a path on this site, and nothing else.
 */

/**
 * The safe destination inside this app, or null when there is not one.
 *
 * Null means "no opinion", and the caller falls back to the Dashboard. Null is the answer to
 * anything suspicious as well as anything absent, so a rejected value is never distinguishable
 * from no value: there is no probing to be done here.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let value = raw.trim();
  if (value === "") return null;

  // Must be a path on this site. Anything with a scheme (https:, javascript:, data:) is out.
  if (!value.startsWith("/")) return null;

  /*
   * "//evil.example" and "/\evil.example" are PROTOCOL-RELATIVE and take the browser to another
   * site entirely. They start with a slash and look local, which is exactly why they are the
   * classic open-redirect payload. Backslash included because browsers normalise it to a slash.
   */
  if (value.startsWith("//") || value.startsWith("/\\")) return null;

  /*
   * The query string is dropped, not kept.
   *
   * Redirecting from a Server Action to a URL carrying a query string trips a known Next.js 15
   * App Router bug (the same one lib/forms.ts documents), and sign-in is the last place in the
   * product that should be gambling on it. Every deep link BCC actually produces is path-only,
   * so this costs nothing real. A fragment goes too: it never reaches the server anyway.
   */
  const cut = value.search(/[?#]/);
  if (cut !== -1) value = value.slice(0, cut);
  if (value === "" || value === "/") return null;

  // Bouncing back to the sign-in screen after signing in is a loop, not a destination.
  if (value === "/login" || value.startsWith("/login/")) return null;

  // Encoded traversal and control characters have no business in a path we are about to follow.
  if (/[\x00-\x1f\x7f]/.test(value)) return null;
  if (value.includes("..")) return null;

  return value;
}

/** The destination for a sign-in, falling back to the Dashboard when there is no safe one. */
export function afterSignIn(raw: string | null | undefined): string {
  return safeNext(raw) ?? "/dashboard";
}

/**
 * The sign-in URL to send somebody to, remembering where they were headed.
 *
 * WHY THIS IS HERE AND NOT INLINE (Phil, 2026-09-15, second half of the same bug). The first fix
 * covered the sign-in WALL: somebody not signed in at all. The case that actually bit him was
 * different and far more common. BCC is single session, so signing in on a phone evicts the
 * desktop and the other way round. He was signed in on the phone, tapped the calendar link, and
 * the eviction check threw him to /login?reason=signed-out-elsewhere, which also dropped the
 * destination. He signed in again and landed on the Dashboard.
 *
 * So the reason and the destination have to travel together, and building that query string in
 * two places by hand is how one of them quietly loses the next again.
 */
export function loginPath(reason?: string | null, next?: string | null): string {
  const params = new URLSearchParams();
  if (reason) params.set("reason", reason);
  const destination = safeNext(next);
  if (destination) params.set("next", destination);
  const qs = params.toString();
  return qs ? `/login?${qs}` : "/login";
}
