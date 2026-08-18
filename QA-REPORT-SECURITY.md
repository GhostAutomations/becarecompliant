# QA REPORT: Security & Permissions Audit (Final Testing Part 2)

Pre-soft-launch penetration / permissions audit, 17 Aug 2026, live production
(www.becarecompliant.com) + database-level proof via the Supabase MCP. Two test
companies: **Acme Care Company** (Pro, the established tenant) and **Bevan Care Ltd**
(Business, seeded this session as the attacker tenant). Roles reused from Part 1.

Method: prove each boundary by CROSSING it, not by reading code alone. DB exploit
attempts run inside rolled-back transactions (nothing persists); live writes are
flagged before running. Companion: UI/UX + functional sweep is Part 1
(QA-REPORT-UIUX.md).

Severity: Critical / High / Medium / Low.

## Verdict

**GO for soft launch on security grounds.** The two audit fixes AND every follow-up
Low item are now deployed and verified live (see "Security hardening", 18 Aug, below).
Nothing open blocks onboarding a real company with real special-category data.

Nothing found in this audit blocks onboarding a real care company with real
special-category data. The two boundaries that matter most for a multi-tenant
compliance product - TENANT isolation and PRIVILEGE isolation - hold:

- Tenant isolation is airtight. A fully-authenticated admin of a second company
  (Bevan) could read, update, delete and insert NOTHING of the first company's
  (Acme) data, proven both at the database (every sensitive table, 0 rows, with a
  passing positive control) and over the live HTTP layer (record URLs bounce to the
  attacker's own empty register; evidence and policy files 404; the founder console
  and founder-wide audit export are refused). RLS is enabled on every table; there
  are no security-definer views and no RLS-disabled tables.
- The ~15 SECURITY DEFINER functions reachable with the public anon key each gate
  internally on auth.uid()-derived membership/admin and fail closed for anon.
- Privilege isolation had ONE real defect - five management pages rendered for a
  care worker - now fixed and re-tested live. The leak was the company branch list;
  RLS kept all colleague holiday/absence/care data and PII locked. Care workers
  cannot complete a colleague's check or elevate their own role (DB triggers refuse).
- Auth/session: single-session enforced, manage-as is admin-only + 30-min + fully
  audit-tagged, profile self-tamper blocked. Webhooks verify signatures and fail
  closed; crons reject anonymous callers; no XSS surface; queries are parameterised.

### Fixed this audit
1. (Medium) Broken access control: five management pages role-gated to block the
   staff role - DEPLOYED + re-tested live.
2. (Low->Medium) Baseline security headers added (X-Frame-Options DENY, nosniff,
   Referrer-Policy, Permissions-Policy) - FIXED: deployed and re-tested live (all four
   present on production; HSTS also present).

### Follow-ups from this audit — ALL CLEARED (18 Aug 2026)
Every Low/Info item below was closed the same session; detail + live evidence in
"Security hardening", further down.
- (Low) Supabase SSR auth cookie is JS-readable (inherent to @supabase/ssr; only
  exploitable via an XSS, of which there is none). CLEARED — compensated by a
  nonce-based CSP now ENFORCED in production.
- (Low) Content-Security-Policy. CLEARED — nonce-based CSP built (Report-Only swept
  across every role, then enforced); does not break Next.js inline scripts.
- (Low) Public trial-request form rate limit. CLEARED — gated on public_form_rate_ok
  (a 6th rapid submit is blocked); normal submit intact.
- (Low, consistency) `/api/reports/register` and `/api/invoicing/export`. CLEARED —
  both now return 403 to a care worker and 200 to an admin.
- (Info) Supabase leaked-password protection (HaveIBeenPwned). DONE — enabled 18 Aug
  (+ minimum length 8); the advisor warning is gone.
- Stripe CLI valid-event idempotency. CLEARED — proven at the DB level (duplicate
  event ids rejected by the stripe_events primary key; processed events not re-run).

## Findings

### Attack surface (mapped)

- Auth model: `middleware.ts` refreshes the Supabase session only; every protected
  page/route/action enforces auth through the `lib/auth/guards.ts` chain
  (`requireUser` -> `requireProfile` -> `requireCompany` / `requireCompanyAdmin` /
  `requirePlatformAdmin`). Tenant scoping is by RLS (the caller's `createClient()`
  JWT client), with the trial lock centralised in `requireCompany`.
- 26 API route handlers; the tenant-scoped ones use `requireCompany()` + the RLS
  client. File/report routes additionally re-check `row.company_id === profile.company_id`.
- Server actions go through the same guards; redirects use the `{redirectTo}`
  client-replace pattern (no Server-Action redirect bug).

### Tenant isolation (multi-company) — PASS at the database

- PASS Cross-tenant READ: as Bev Admin (company_admin of Bevan) impersonated at the
  DB, every one of Acme's tables returned 0 visible rows: people, service_users,
  evidence, evidence_files, check_instances, holiday_requests, profiles,
  company_policies, audit_log, companies, complaints, incidents,
  whistleblowing_disclosures, complaint_responses, planner_bookings, invoices,
  branches. Positive control passed (Bev Admin sees their OWN company's 10 check
  definitions), so the harness is valid.
- PASS Cross-tenant WRITE: as Bev Admin, UPDATE and DELETE against Acme people,
  evidence, check_instances and companies all affected 0 rows (RLS filters them
  from the row set). INSERT of a pending holiday for an Acme person was rejected
  ("new row violates row-level security policy"), and an approved-status insert was
  additionally caught by the 0206 BEFORE INSERT trigger
  ("You do not have permission to book this holiday as already approved").
- PASS Live HTTP-layer IDOR as the Bevan admin session (real cross-tenant login):
  Acme evidence file -> 404 "File not found."; Acme policy file -> 404 "Policy not
  found."; Acme person and service-user record URLs -> redirected to Bevan's OWN
  empty register (no Acme data rendered); /founder + /founder/companies -> redirect
  (a company_admin is not platform_admin); founder-scope audit export -> 403
  "Founder access only". Bevan's own /settings/users -> 200 (correct, they admin it).
  The Pro-gated record-param report routes (evidence-pack, record audit) returned
  403 on Bevan's Business tier before the record lookup; the cross-tenant 404 for
  those paths is proven at the code + DB layer (RLS client + can_manage gate).

### The anon RPC surface — PASS

- The Supabase security advisor reports 0 ERROR findings: RLS is enabled on every
  public table, no SECURITY DEFINER views, no exposed auth.users, no
  rls_disabled_in_public. (Full advisor parse retained.)
- ~15 SECURITY DEFINER functions are EXECUTE-granted to the `anon` role (the public
  publishable key), the classic Supabase default-grant surface. Every one inspected
  gates internally and fails closed when `auth.uid()` is null:
  get_company_user_names (no param, keys off auth.uid()'s company),
  company_profiles_by_id + list_company_staff (honour a passed company id only for a
  member/platform admin; the latter two are additionally REVOKED from anon),
  sar_evidence_for_subject (is_platform_admin OR is_company_admin(cid)),
  decide_holiday_request + anonymise_evidence + complete_check + set_person_check_due
  (explicit `auth.uid() is null -> raise`, then a can_manage/can_complete gate).
  Empirically, calling the anon-granted data functions as the `anon` role with
  Acme's real IDs returned 0 rows / permission denied.

### Auth / session

- PASS Single session: `requireUser` decodes the JWT session id and signs the user
  out ("signed-out-elsewhere") if it is not the active row in `user_sessions`;
  observed working in Part 1.
- PASS Manage-as (impersonation) is properly bounded: it only shadows a
  `platform_admin` (`applyManageAs` returns the profile unchanged for anyone else, so
  a forged manage-as cookie is inert for a normal user); the cookie is a signed,
  httpOnly, 30-minute token (the lapse was observed expiring in Part 1); and every
  write during a support session is audit-tagged - confirmed in the DB:
  `whistleblowing.created/updated` and `incident.status_changed` by the founder carry
  `actor_role=platform_admin` and `metadata {impersonating:true, acting_company_id}`.
- PASS Profile self-tamper blocked: the `enforce_profile_protected_fields` trigger
  refuses any change to role, company or status by the row's owner (proven as
  Charlotte above).
- FINDING (Low, defense-in-depth) The Supabase SSR auth cookie
  (`sb-...-auth-token`, holding the access AND refresh token) is readable by
  JavaScript (not httpOnly). This is the standard `@supabase/ssr` behaviour (the
  browser client must read it, and making it httpOnly breaks client-side auth +
  realtime), and it is only exploitable via an XSS - of which this audit found NONE
  (no dangerouslySetInnerHTML, React escaping, parameterised queries). Mitigation:
  keep the no-XSS posture; a nonce-based CSP is now ENFORCED in production as the
  compensating control (see below). The cookie itself is architectural — making it
  httpOnly would break client auth + realtime — so it stays; documented for awareness.
- FIXED (Low->Medium, batch 2) Missing baseline security headers. The app served no
  X-Frame-Options (clickjacking - a compliance app that approves/completes records
  should not be frameable), no X-Content-Type-Options, no Referrer-Policy (record IDs
  sit in URLs and would leak via Referer), no Permissions-Policy. HSTS WAS present
  (max-age 2y, platform-set). Added all four via next.config.ts headers(): X-Frame-
  Options DENY, nosniff, Referrer-Policy strict-origin-when-cross-origin,
  Permissions-Policy locking camera/mic/geo/topics. RE-TESTED LIVE: all four headers
  present on production responses (HSTS also present); a nonce-based CSP has since been
  added and enforced (see below).
- CLEARED (was Low) Content-Security-Policy. Built as the compensating control for the
  JS-readable auth cookie, with per-request nonces so it does not break Next.js inline
  scripts. Added in Report-Only, swept across every role with a clean console, then
  ENFORCED in production (see "Nonce-based CSP", below).

### Role / privilege isolation

- FINDING FIXED (Medium) BROKEN ACCESS CONTROL: five management sub-pages rendered
  for a Care Worker (the `staff` role) instead of redirecting like their siblings do.
  As Charlotte (staff, Newport1) these returned 200: `/people/holiday`,
  `/people/absence`, `/people/summary`, `/service-users/summary`,
  `/briefings/coverage`. `/people`, `/people/training`, `/people/submissions`,
  `/service-users`, `/settings*`, `/founder*`, `/reports`, `/complaints`,
  `/incidents`, `/whistleblowing`, `/invoicing`, `/planner`, `/on-call`, `/briefings`
  all correctly redirected.
  Concrete exposure: the holiday/absence/summary pages render a branch selector that
  ENUMERATES every company branch name (Caerphilly, Cardiff1, Newport1, Office) to a
  care worker. The records within (pending holidays, absences, RAG counts, coverage)
  are RLS-scoped to the caller, so NO colleague holiday/absence/care data or PII
  leaked - confirmed: as Charlotte's JWT, visible people = 1 (herself), profiles = 1,
  service users = 0, complaints = 0, whistleblowing = 0, and her People-summary counts
  read "1 active record".
  Root cause: `/people` and `/people/training` redirect `staff`; the five pages used
  `requireCompany()` (any member) with no role gate. Fix: each page now redirects
  `staff` to `/my` (holiday/absence/summaries) or non-manager roles to `/dashboard`
  (briefings coverage), matching the guard on its register/send sibling. tsc + 402
  tests green. RE-TESTED LIVE after deploy: all five now redirect Charlotte to /my;
  the change is additive (staff only) so manager/admin/supervisor/viewer are unaffected.
- PASS Care worker cannot escalate via writes: `complete_check` on a colleague's
  check raised "Not allowed to complete this check"; self-elevation
  (`update profiles set role='company_admin'` on her own row) raised "Not allowed to
  change role, company or status" (the enforce_profile_protected_fields trigger).
- PASS Care worker API surface: company audit export -> 403; colleague evidence pack
  -> 404 "cannot access it"; colleague evidence + evidence_files -> 0 visible at the
  DB (record-scoped, not company-scoped); on-call export -> 403. The register and
  invoicing exports returned 200 but RLS-empty (0 invoices, her own 1 record); now
  CLEARED — both role-gate to a clean 403 for below-Manager roles (care worker 403,
  admin 200; see "Register + Invoicing export role-gates", below).
- PASS Cross-tenant + anon already covered above.

### Data / files / privacy

- PASS Record-level file isolation (DB-proven as a care worker): Charlotte sees 8
  evidence_files, ALL her own; 0 evidence_files belonging to any other record; 0 of a
  colleague's evidence rows. The evidence file route redirect she got was to her OWN
  signature file, not a colleague's.
- File routes (evidence, policies, training, assignments) read through the RLS
  client AND re-check company_id; served via 5-minute signed URLs; downloads
  audit-logged; policy/evidence streams are `private, no-store`.
- PASS (live, 18 Aug) signed-URL expiry + cross-tenant file fetch — CLOSED:
  - Cross-tenant HTTP: as Bev (Bevan admin) GET /api/evidence/<an Acme evidence id>/file
    -> 404 "File not found"; the SAME file requested by an Acme user (Charlotte) -> 302
    to a signed URL, image rendered (200). Company isolation, not a broken file.
  - Signed-URL expiry: the download JWT carries scope=download, iat and exp with a 300s
    (5 min) TTL. The exact link that returned the image at 14:42:09 UTC, re-fetched at
    14:47:36 (27s after its 14:47:09 exp), returned 400 InvalidJWT "exp claim timestamp
    check failed". A download link cannot be reused once it expires.
  - Token integrity: flipping a significant signature byte -> 400 InvalidJWT "signature
    verification failed" (the token cannot be modified to extend exp or repoint the path).
  - Private bucket: the evidence bucket is public=false; the object's public URL -> 400
    "Bucket not found". Storage RLS (evidence_objects_select) additionally requires
    is_company_member(first path folder = companyId).

### Input / integration security

- PASS Crons live: anonymous GET to /api/cron/daily-digest, /invoicing and
  /retention all returned 401 Unauthorized (CRON_SECRET set, no Bearer header).
- PASS Stripe webhook live: missing signature -> 400 "Missing signature"; forged
  signature -> 400 "Invalid signature". Fail-closed 503 (no secret) is code-verified.
- PASS Twilio webhook live: unsigned POST -> 503 "Twilio webhook is not configured"
  (fails CLOSED; TWILIO_AUTH_TOKEN unset in prod, matching SMS-not-yet-live).
- PASS XSS surface: zero dangerouslySetInnerHTML in the codebase (the only two
  matches are comments noting its deliberate absence); React escapes by default. All
  DB access is parameterized (.rpc() / supabase.from()); no raw SQL interpolation.
  Now CONFIRMED — every user-controlled value in the email templates is escapeHtml-
  wrapped; verified by running the real renderLetterHtml against a hostile <script>
  name (see "Digest / email template escaping", below). Self-scoped and low impact
  regardless.
- PASS Rate limiting: Supabase GoTrue rate-limits sign-in / sign-up / OTP / password
  reset at the platform (the brute-force surface). The public holiday form gates on
  `public_form_rate_ok` (5 hits / 10 min per key). The public trial-request form
  (`submitTrialRequest`) has a honeypot field, length-capped inputs, email-format
  validation, HTML-ESCAPED notification emails, and — now CLEARED — a rate limit. It
  gates on the same `public_form_rate_ok` after the honeypot: a bot that skips the
  honeypot is throttled (a 6th rapid submit is blocked), while a normal submission
  still creates its trial_requests row. (Impact was only spam of the founder's
  trial-requests list; no data or auth exposure.)
- The earlier "HTML email injection" concern is handled on the trial path (escapeHtml
  on every interpolated value) AND now CONFIRMED on the digest / reporting /
  calendar-invite templates too (every interpolated value escaped; see below).
- (Cron/webhook code notes retained above; all proven live this session.)
- Server-side validation: form submissions go through validateAnswers server-side
  in submit_evidence and the public-form path; client validation is not relied on.
- Stripe CLI: the security-critical webhook behaviour (bad/forged signature -> 400,
  fail-closed -> 503) is proven. The valid-event idempotency check is now CLEARED too
  — proven at the DB level (a duplicate event id is rejected by the stripe_events
  primary key; an already-processed event is not re-run; see "Stripe webhook
  idempotency", below).

---

## Security hardening — 18 Aug 2026 (clearing the open Low items)

Deploy `dpl_5uN7gkjg5xhHdBmEP3cmncFzQhFo` (branch main). Order: quick wins first
(rate limit, export gates, email escaping); nonce CSP and the Stripe CLI check to
follow. `tsc --noEmit` clean and 402/402 tests green before deploy.

### CLEARED — Trial-request Form rate limit (was FINDING, Low)

- Fix: `submitTrialRequest` gates on `public_form_rate_ok(sha256(ip:"trial-request"),
  5, 10)` after the honeypot, before the DB insert and the founder notification. A
  read error and an over-limit both return a friendly message; neither provisions
  anything. No IP is stored (hash only).
- LIVE EVIDENCE: DB probe with a fresh key and the exact params the Form uses returned
  `[true,true,true,true,true,false]` — first 5 allowed, 6th blocked. Happy path
  re-tested live: a normal submission created a `trial_requests` row (server 200), so
  the change did not break lead capture.

### CLEARED — Register + Invoicing export role-gates (was NOTE, Low)

- Fix: `/api/reports/register` and `/api/invoicing/export` return a clean 403 for roles
  below Manager (was 200 + RLS-empty). Allow-list matches the page guards:
  platform_admin, company_admin, registered_individual, registered_manager, manager.
- LIVE EVIDENCE (server-side status via Vercel runtime logs, deploy dpl_5uN7...):
  - Register: care worker `staff` (Charlotte, Acme) -> 403 (09:38); company_admin
    (Bev, Bevan Care Ltd) -> 200, five exports (09:46-09:54). A browser top-level
    navigation to these attachment responses shows a client-side "503" as Chrome
    aborts the navigation to download; the server returned 200 (log-confirmed, and
    every attempt logged "Exported People register" to the audit feed).
  - Invoicing: care worker `staff` -> 403 "Invoicing is available to Managers and
    above." (the new role gate); company_admin (Bev) PASSES the role gate and is then
    stopped by the pre-existing Pro-tier gate -> 403 "Invoicing is a Pro feature."
    (Bevan Care Ltd is business tier). On a Pro company an admin passes both -> 200
    CSV. The role gate correctly admits Manager+; the tier gate is a separate, correct
    control.

### CLEARED — Digest / email template escaping (was NOTE, Low, to confirm)

- Verdict: NO code change needed. Every user-controlled value across the digest,
  reporting, chaser, calendar-invite and invoice templates plus the shared shell
  (record / check / branch / company names, employee and conductor names) is wrapped
  in `escapeHtml` / `esc`. The only raw slots (`detailHtml`, `bodyHtml`) are composed
  server-side from already-escaped fragments; the shell escapes heading, preheader,
  title, footerNote, ctaUrl and ctaLabel.
- EVIDENCE: ran the real `renderLetterHtml` (the highest-risk sink — free-text
  employee names flowing into the raw calendar-invite `detailHtml`) against
  `<script>alert('xss')</script> O'Brien & <b>Sons</b> "Quote"`. Output came back fully
  escaped (`&lt;script&gt;... &amp; &lt;b&gt;... &quot;`), no live tags. Subject lines
  keep raw text — correct, they are plain-text JSON fields to Resend, never rendered
  as HTML.

### CLEARED — Nonce-based Content-Security-Policy (enforcing)

- Implemented a per-request nonce in middleware (inside Supabase `updateSession`, the
  cookie logic untouched), forwarded via the `x-nonce` + `Content-Security-Policy`
  request headers so Next.js 15 nonces every one of its inline scripts. Policy:
  `default-src 'self'; script-src 'self' 'nonce-<per request>' 'strict-dynamic';
  style-src 'self' 'unsafe-inline'; connect-src 'self' + Supabase REST + Realtime;
  object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`.
- WHY: compensating control for the JS-readable Supabase auth cookie — an injected
  inline <script> without the unguessable, per-request nonce cannot run.
- Report-Only first (deploy dpl_5uN7...): swept EVERY role with the console open —
  public (home / pricing / privacy / start-trial), staff (/my), admin (dashboard,
  reports, report viewer, people, add-person form, settings, billing/Stripe, service
  users, incidents, whistleblowing, briefings, plus a form submit and a popover), and
  founder (console, revenue, companies, trial-requests). ZERO violations; all 50
  homepage script tags carried the nonce; no enforcing CSP header leaked.
- Flipped to ENFORCING (deploy dpl_5Svc...): confirmed the response now serves a
  blocking `Content-Security-Policy` (the Report-Only header is gone), all scripts
  still nonced, and client hydration intact (window.next loaded, App Router flight
  data present). Nothing broken: dashboard / reports / forms render, client-side nav
  and popover work, and the PDF export returns 200 under enforcement (server log
  18 Aug 11:19:25, dpl_5Svc...).

### CLEARED — Stripe webhook idempotency (valid event re-delivered)

- Verified at the database + code level (no live CLI run needed). The webhook claims
  every event id in `stripe_events` before handling, and the table has a PRIMARY
  KEY (id) — so a re-delivered event cannot create a second row. Proven live: a
  duplicate insert of an already-processed event id (evt_1U486...) was rejected with
  SQLSTATE 23505, exactly the path `claimEvent` catches. For a row already
  status='processed' the handler returns `{received:true, duplicate:true}` and does
  NOT re-run (`if (claim === "skip") return ...`), and `processed_at` is never touched
  on the skip path — so the side effect happens exactly once however many times Stripe
  re-delivers.
- With the signature checks already proven (missing signature -> 400, forged -> 400,
  no secret -> 503 fail-closed), the Stripe webhook is fully closed out.

## Security hardening — all five Low items CLEARED

1. Nonce-based CSP — enforcing, clean across every role.
2. Trial-request Form rate limit — throttles at the limit, happy path intact.
3. Register + Invoicing export role-gates — 403 below Manager, works for admins.
4. Digest / email template escaping — verified, every user value escaped.
5. Stripe webhook idempotency — duplicate re-delivery skipped, proven at the DB.

### DONE — Phil (Auth dashboard, 18 Aug 2026)

- Leaked-password protection ENABLED (new / changed passwords are checked against
  HaveIBeenPwned) and minimum password length set to 8. The Supabase security advisor
  "Leaked Password Protection Disabled" warning has cleared.

Nothing open — including the carried-over file-isolation check (signed-URL expiry +
cross-tenant fetch), now closed live in the Data / files / privacy section above.
Security hardening complete.


---

## NOTE (cosmetic, fixed 18 Aug 2026) — export download "503" in the browser Network panel

Opening an export URL as a top-level navigation (typing/pasting it, or clicking a plain
download link) makes Chrome begin a main-frame navigation and then abort it to turn the
`Content-Disposition: attachment` response into a download. That aborted navigation is
labelled "503" in the browser's Network/devtools panel — but the SERVER returns 200
(Vercel log-confirmed) and the user sees nothing: the page stays in place and the file
downloads. Verified live: clicking "Download PDF" as an admin kept the report page fully
in place, server 200. Tidied anyway by adding the HTML `download` attribute to the
same-origin export links (register PDF/CSV, invoicing CSV, inspection pack) so a click is
an explicit download with no aborted navigation — the Network panel stays clean too. The
single-invoice PDF link is left as-is (a deliberate open-in-new-tab view, not a download).
