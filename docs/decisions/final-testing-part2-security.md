# Final testing part2 security

> Final Testing Part 2 (security & permissions pen-test), 17 Aug 2026: verdict GO. Tenant + privilege isolation proven; the ONE real defect (5 staff-reachable management pages) fixed; headers added; the Low open items and the RLS/anon test technique. Read before any security discussion or a real-company onboard

Run 17 Aug 2026, COMPLETE. QA-REPORT-SECURITY.md in the repo is the authoritative log;
PHASES.md Phase 11 has the dated summary. Verdict: **GO for soft launch on security
grounds** - nothing blocks onboarding a real company with real special-category data.

## Setup used (reusable)

Two companies: Acme (Pro, ref data) + **Bevan Care Ltd** (Business, seeded this session
as the attacker tenant; admin (Phil's Bevan admin login), keep for future tenant tests).
Roles reused from Part 1. Method: cross the boundary, don't just read code. DB exploit
attempts run inside rolled-back transactions; live writes flagged first.

## The RLS/anon test technique (use this every time)

Impersonate a role at the DB, rolled back, faithfully reproducing PostgREST:
`begin; set local role authenticated; set local request.jwt.claims =
'{"sub":"<profile id>","role":"authenticated"}'; <selects / attempted writes>; rollback;`
For the anon surface use `set local role anon` + `'{"role":"anon"}'`. Always run a
POSITIVE CONTROL (count the impersonated user's OWN rows) so a pass isn't just an empty
harness. To find anon-reachable functions: `has_function_privilege('anon', p.oid,
'EXECUTE')` - the Supabase advisor OVER-reports (several are actually revoked from anon).

## What held (all proven, not assumed)

- TENANT isolation airtight: as Bev Admin, 0 Acme rows readable/updatable/deletable
  across every sensitive table; INSERT rejected by RLS WITH CHECK (and the 0206 holiday
  trigger); over HTTP, Acme record URLs redirect to Bevan's own empty register, evidence
  + policy files 404, founder console + founder audit export refused.
- Anon RPC surface: ~15 SECURITY DEFINER functions are EXECUTE-granted to anon (the
  public key). Every one gates internally on auth.uid()-derived membership/admin (many
  open with `if auth.uid() is null then raise`) and returns nothing / raises for anon.
  No security-definer VIEWS, no RLS-disabled tables (advisor: 0 ERROR).
- File/report routes use the RLS client AND re-check row.company_id === profile.company_id.
- Webhooks verify signature on the raw body, fail closed 503 without the secret (Stripe
  missing + forged sig -> 400 live; Twilio unsigned -> 503). Crons: anonymous GET -> 401.
- manage-as: shadows ONLY platform_admin (forged cookie inert), signed httpOnly 30-min
  (lapse observed Part 1), every impersonation write audit-tagged
  {impersonating:true, acting_company_id}.
- Care worker cannot complete a colleague's check ("Not allowed") or self-elevate role
  (enforce_profile_protected_fields trigger: "Not allowed to change role, company or
  status"). Evidence is RECORD-scoped for staff (sees only her own).
- No XSS surface: zero dangerouslySetInnerHTML (only comments noting its absence); all
  DB access parameterised. Public forms rate-limited (public_form_rate_ok, 5/10min).

## Fixed this session (2 batches)

1. MEDIUM broken access control: /people/holiday, /people/absence, /people/summary,
   /service-users/summary, /briefings/coverage rendered for the `staff` role (care
   worker) - they used requireCompany() (any member) with no role gate, while /people
   and /people/training redirect staff. Exposure was the company BRANCH LIST; RLS kept
   all colleague holiday/absence/care data + PII locked (as the test carer: 1 person visible
   = herself). Fixed: each redirects staff to /my (or non-manager to /dashboard for
   coverage), matching its sibling. DEPLOYED + re-tested live (all five now redirect).
   The fix is ADDITIVE (staff only) so manager/admin/supervisor/viewer are unaffected.
2. Baseline security headers via next.config.ts headers(): X-Frame-Options DENY,
   X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin,
   Permissions-Policy. HSTS already platform-set. (Push was pending Phil at session
   end - confirm live: fetch any page, expect the four headers.)

## Open, none blocking (Low - for Phil)

- Supabase SSR auth cookie (sb-...-auth-token, holds access+refresh) is JS-readable
  (not httpOnly). INHERENT to @supabase/ssr (browser client must read it; httpOnly
  breaks realtime + client auth). Only exploitable via an XSS - none found. Compensate
  with a CSP.
- No Content-Security-Policy. Recommended as a NONCE-BASED tested follow-up; a blocking
  CSP added blind breaks Next.js inline scripts. Do NOT add one without testing.
- Public trial-request form: honeypot + length caps + email validation + escapeHtml on
  the notification email, but NO rate limit. Spam-only (founder approves each). Gate on
  public_form_rate_ok if desired.
- /api/reports/register + /api/invoicing/export return 200 to a care worker but are
  RLS-empty (leak nothing); could role-gate for consistency.
- Supabase leaked-password protection (HaveIBeenPwned) is OFF - one-click enable in the
  Supabase Auth dashboard, sensible before real sign-ups.
- Optional: live Stripe CLI valid-event idempotency run (security-critical signature +
  fail-closed already proven).

Related: [final-testing-part1](final-testing-part1.md) [permission-boundaries](permission-boundaries.md) [project-state](project-state.md)
[look-at-the-artefact](../process/look-at-the-artefact.md) `cowork-sandbox-limits` (not carried over)
