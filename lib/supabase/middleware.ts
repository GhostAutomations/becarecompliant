import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canUseModule, disabledKey } from "@/lib/auth/module-catalogue";
import { moduleForPath, NO_ACCESS_PATH } from "@/lib/auth/module-paths";
import { amrFromAccessToken, isRecoverySession } from "@/lib/auth/password-reset-rules";

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
  // Subscribed planner calendars: /calendar/<token>/planner.ics. Outlook fetches this with
  // no session and never will have one, so the token in the path IS the authentication. The
  // route derives everything from that token and takes nothing else from the request.
  "/calendar",
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
  /* The path, for the guards. A Server Component cannot read the URL it is rendering, and
     requireUser has to know where somebody was headed when it sends them to sign in. */
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

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
          refreshedHeaders.set("x-pathname", request.nextUrl.pathname);
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
    /*
     * REMEMBER WHERE THEY WERE GOING (Phil, 2026-09-15). This used to clear the search and send
     * everyone to the Dashboard after signing in, so every deep link into BCC lost its
     * destination: a task link from the calendar, a link in an email we sent, a bookmark, a link
     * a colleague pasted. The person arrived somewhere they had not asked for and had to find
     * the job by hand, which is the thing the link existed to save them.
     *
     * Only the PATH is carried, and signIn validates it again through safeNext before following
     * it, because a value that arrives in a URL is written by whoever sent the URL.
     */
    url.search = "";
    if (pathname !== "/" && !pathname.startsWith("/login")) {
      url.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(url);
  }

  /*
   * THE DEPARTMENT GATE (Phil, 2026-09-17): a company chooses which departments each role opens.
   *
   * IN MIDDLEWARE, AND NOT IN EVERY PAGE. There are 102 pages under (app). A guard per page is 102
   * chances to forget one, and the one forgotten is the page somebody reaches by typing the URL.
   * It is also the very shape this feature exists to end: one more list of roles, drifting from
   * the others. One gate, and a page added tomorrow under an existing department is covered the
   * moment it exists.
   *
   * IT COSTS TWO SMALL QUERIES — three for somebody on a role their company made (0314) — and
   * only on a path that IS a department: not on /my, not on /welcome, not on any API route.
   * Every one is a primary key or single column index read.
   *
   * IT CANNOT WIDEN ANYTHING. canUseModule refuses anything outside the role's ceiling and the
   * ceiling is in code, so the worst this gate can do is hide a page somebody was entitled to.
   * RLS is still what decides whether a record may be read.
   */
  const moduleKey = user ? moduleForPath(pathname) : null;
  if (user && moduleKey) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id, company_role_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = (profile as { role?: string } | null)?.role ?? "";
    const companyId = (profile as { company_id?: string | null } | null)?.company_id ?? null;
    const companyRoleId =
      (profile as { company_role_id?: string | null } | null)?.company_role_id ?? null;
    /* No profile yet means sign up is still in flight; requireProfile handles that properly a
       moment later, and guessing here would bounce somebody mid-onboarding. */
    if (role) {
      const disabled = new Set<string>();
      if (companyId) {
        const { data: rows } = await supabase
          .from("company_role_modules")
          .select("role, module_key")
          .eq("company_id", companyId);
        for (const r of ((rows as Array<{ role: string; module_key: string }> | null) ?? [])) {
          disabled.add(disabledKey(r.role, r.module_key));
        }
      }
      /* Their own role, if their company made one (0314). Keyed on the BUILT-IN role, because
         that is the key canUseModule asks with -- and this set is only ever this one person's. */
      if (companyRoleId) {
        const { data: offRows } = await supabase
          .from("company_role_modules_off")
          .select("module_key")
          .eq("company_role_id", companyRoleId);
        for (const r of ((offRows as Array<{ module_key: string }> | null) ?? [])) {
          disabled.add(disabledKey(role, r.module_key));
        }
      }
      if (!canUseModule(moduleKey, role, disabled)) {
        const url = request.nextUrl.clone();
        /* A TEAM MEMBER'S HOME IS MY AREA (found live 2026-09-25). Setting a password at /welcome,
           and signing in with no link, both finish at /dashboard, which a Team Member login can
           never open, so every carer who accepted their invite landed on "That area is switched
           off" with nowhere to go. The pages themselves send staff to /my, but this gate runs
           first. Send them home instead, unless their company has closed My area too. */
        url.pathname =
          role === "staff" && canUseModule("team_portal", role, disabled) ? "/my" : NO_ACCESS_PATH;
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  /* A session made by a reset link is not a signed in person yet (Phil, popup 2026-09-23): "Back to
     sign in" must show the sign in page, not bounce them into the dashboard it cannot reach. */
  const resetOnly =
    user && pathname === "/login"
      ? isRecoverySession(amrFromAccessToken((await supabase.auth.getSession()).data.session?.access_token))
      : false;
  if (user && pathname === "/login" && !resetOnly) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // HTML-rendering path: attach the policy (Report-Only for now).
  supabaseResponse.headers.set(CSP_HEADER, csp);
  return supabaseResponse;
}
