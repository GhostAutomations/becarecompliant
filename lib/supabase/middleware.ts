import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Paths reachable without a session. Webhook paths MUST be added here
 * when they are created (Stripe, Twilio, Resend, crons).
 */
export const PUBLIC_PATHS = [
  "/", // marketing homepage
  "/pricing",
  "/start-trial",
  "/privacy",
  "/login",
  "/auth",
  "/api/webhooks",
  "/api/cron",
  "/meeting-response",
  "/f", // public (no account) forms: /f/<company-slug>/<form-key>
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Per-request Content-Security-Policy with a nonce.
 *
 * WHY a nonce, and why here. The Supabase auth cookie is readable by JavaScript, so a
 * single injected inline <script> could exfiltrate a live session. A nonce-based CSP
 * is the compensating control: only a script carrying THIS request's nonce runs, and
 * the nonce is unguessable and regenerated every request, so an attacker cannot
 * pre-write a valid one into stored content. next.config headers() is static and
 * cannot do this, so the policy is built in middleware where each request is unique.
 *
 * 'strict-dynamic' lets Next.js's nonced bootstrap load the hashed chunk scripts it
 * needs without listing each filename; 'self' is the fallback for browsers that do
 * not understand strict-dynamic. Styles deliberately keep 'unsafe-inline': a style
 * nonce would disable the inline style="" attributes React and Tailwind emit, and
 * injected CSS cannot execute script. Supabase REST + Realtime are allowed to connect.
 */
function buildCsp(nonce: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseWss = supabaseUrl.replace(/^https:/, "wss:");
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseUrl} ${supabaseWss}`,
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
}

/**
 * ENFORCING. Verified first in Report-Only across every role (public, staff, admin,
 * founder) with a clean console and all scripts carrying the nonce, so serving the
 * enforcing header name blocks nothing legitimate. Revert to
 * "Content-Security-Policy-Report-Only" to return to observe-only if a future change
 * needs re-checking.
 */
const CSP_HEADER = "Content-Security-Policy";

/** Refreshes the Supabase session and enforces auth redirects. */
export async function updateSession(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // Forward the nonce to Next.js (it reads the 'Content-Security-Policy' request
  // header to nonce its own inline scripts) and to Server Components (via x-nonce)
  // for any inline script they render themselves.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          // Rebuild forwarded headers so they carry BOTH the refreshed cookies and
          // the nonce (a plain new Headers(request.headers) here would drop it).
          const refreshedHeaders = new Headers(request.headers);
          refreshedHeaders.set("x-nonce", nonce);
          refreshedHeaders.set("Content-Security-Policy", csp);
          supabaseResponse = NextResponse.next({
            request: { headers: refreshedHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and auth.getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // HTML-rendering path: attach the policy (Report-Only for now).
  supabaseResponse.headers.set(CSP_HEADER, csp);
  return supabaseResponse;
}
