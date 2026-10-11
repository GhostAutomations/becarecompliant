# Two factor sign in (audit F62): mapping done 11 Oct 2026, not built

Why: the Data Processing Agreement (live 1.0 at `lib/legal/text.ts:513` and the v1 draft, Annex 2
"Accounts and sign in") says "Company Admins and our founder sign in with two factor
authentication". Nothing in the app does this yet. `docs/decisions/subscription-agreement.md`
already said to build it before publishing. Phil chose (11 Oct 2026) to build it after the 10 step
fix plan from the October audit is finished.

Nothing below is agreed with Phil yet. The four questions at the end go to him by popup first.

## Facts checked (11 Oct 2026)

- Supabase Auth MFA, authenticator app (TOTP): free and on by default for every project. Codes
  last 30 seconds with one step of clock skew. Up to 10 factors a user. No recovery codes yet
  (server side recovery codes arrived in Auth v2.197.0, off by default; the installed client has
  no API for them). Sources: https://supabase.com/docs/guides/auth/auth-mfa/totp,
  https://supabase.com/docs/reference/javascript/auth-mfa, https://github.com/supabase/auth/blob/master/CHANGELOG.md
- `auth.jwt()->>'aal'` is `aal2` once a code is verified; a token with no `aal` counts as aal1.
  Verify keeps the same session id, issues a new refresh token, and deletes the user's other aal1
  sessions. aal2 survives refresh. https://supabase.com/docs/guides/auth/auth-mfa
- A lost factor is removed with `auth.admin.mfa.deleteFactor` (service role), which signs the user
  out everywhere. https://supabase.com/docs/reference/javascript/auth-admin-deletefactor
- Challenge and verify must come from the same IP, and are limited to 15 a minute per IP (fixed).
  Vercel's outbound IPs change, so use `challengeAndVerify` in one server call. Supabase's cap on
  wrong codes is a Teams plan hook, so we need our own per login counter.
  https://supabase.com/docs/guides/auth/rate-limits
- SMS codes are a paid add on (75 dollars a month) and the NCSC ranks them last; authenticator
  apps rank above them. https://supabase.com/docs/guides/platform/manage-your-usage/advanced-mfa-phone,
  https://www.ncsc.gov.uk/collection/mfa-for-your-corporate-online-services/recommended-types-of-mfa
- Installed: supabase-js and auth-js 2.110.1, @supabase/ssr 0.7.0. The MFA API is all there.

## Who it affects (live counts, 11 Oct 2026)

- 4 logins: the Founder, and one Company Admin each at Thistle (Phil), Bevan and Demo Care.
  No other Thistle login is affected. 0 factors enrolled, every session aal1.
- Company Admin is exactly `profiles.role = 'company_admin'`; custom roles cannot copy it.

## Where it must be enforced

1. `requireProfile` in `lib/auth/guards.ts`, on the real role before `applyManageAs`: a Company
   Admin or Founder at aal1 goes to the code step, one with no factor goes to set up. This covers
   the layout, every company and Founder guard, the agreement and lock pages, and manage as.
2. `requireUser` (4 direct callers, one of them an Admin write in `lib/setup/actions.ts:21`):
   after the reset check, before the slot check.
3. Middleware (`lib/supabase/middleware.ts`, after `getUser`): anyone with a verified factor at
   aal1, public paths exempt. Catches routes that only call `getUser` (`app/api/demo/beat`).
4. The database, because the browser holds the token and can call the API directly: one
   `mfa_ok()` check inside `is_platform_admin()` and the company_admin branch of
   `is_company_admin`, `is_company_wide`, `my_admin_company_id`, `my_wide_company_id`,
   `my_lead_branch_ids`, plus the functions that test the role as a literal
   (`can_see_support_ticket`, `list_company_conductors`, `raise_support_ticket`,
   `record_update_audience`, `company_active_user_count`, `founder_set_setup_step`,
   `rebake_form_field_options`, the `invites_insert` policy). Service role callers are not
   affected (no `sub`, already false). Registered Individuals and Managers share
   `is_company_wide` and are not part of the promise, so only the company_admin branch changes.

## Build order (so nobody is locked out)

- Stage 1: set up screen, code step, the app checks (1 to 3), Founder reset, audit logging. Phil
  and the Bevan Admin set up and test.
- Stage 2, a later migration once every Admin has set up: the database check (4). The RLS proof
  pattern and `scripts/access-probe.sql` then need `"aal":"aal2"` in their claims for admins.

## Pitfalls found

- `signIn` (`app/login/actions.ts:53`) and `/auth/confirm` claim the device slot at aal1, so a
  stolen password alone could sign the real Admin's device out. Claim after the code instead.
- `requireUser`'s slot check signs out an unclaimed session, so the code page must not run it.
- Call verify only in a server action or route (Server Components cannot write the new cookie).
- Read aal from the verified token and factors from `getUser()`, never
  `getAuthenticatorAssuranceLevel()` without a token on the server.
- The code page lives under `/login/two-factor` (public prefix; it checks the session itself).
  Middleware sends signed in users on `/login` to `/dashboard`, so not `/login` itself.
  `safeNext` refuses `/login/*`, so carry `next` another way. SessionWatch only follows `/login`.
- Password reset and welcome set the password with the service role, which skips Supabase's aal2
  rule for password changes; the next sign in still asks for the code, which is right.
- An invited Admin's order: welcome, set up two factor, agreement, payment.
- Abandoned set ups leave an unverified factor for 5 minutes; clear it before enrolling again
  (friendly names are unique per login).
- Mobile: show the setup key with a copy button and an `otpauth://` link; `inputMode="numeric"`,
  `autoComplete="one-time-code"`. A code box needs a class in `app/globals.css`.
- Wrong phone clock fails every code: the error should say to set the time automatically.
- `signout-scope.test.ts` checks the shape of the eviction code in `requireUser`; keep it.
- Audit actions: `two_factor.enrolled`, `two_factor.removed`, `two_factor.reset_by_founder`,
  `two_factor.code_failed`. Never log the secret.
- Once a login has a verified factor, always ask for the code, whatever its role.

## Questions for Phil (popups, recommended first)

1. Demo logins are Company Admins: leave demos out (recommended; made up data, and demos already
   skip the agreement), or demos too.
2. Lost phone: a Founder only "Reset two factor sign in" on the company page (recommended), or
   Supabase dashboard steps each time.
3. A second, backup authenticator app: allow it (recommended; matters most for the Founder, the
   only one who can reset others), or one app only.
4. Where the screen lives: a "Two factor sign in" page opened from the name in the top bar, for
   Admins and the Founder (there is no own account page today).
