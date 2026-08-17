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

PENDING: audit in progress.

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

- PENDING: forged/tampered cookie, sign-out, single-session, manage-as scoping +
  30-min lapse + impersonation audit tag.

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
  tests green. Re-test after deploy: PENDING.
- PASS Care worker cannot escalate via writes: `complete_check` on a colleague's
  check raised "Not allowed to complete this check"; self-elevation
  (`update profiles set role='company_admin'` on her own row) raised "Not allowed to
  change role, company or status" (the enforce_profile_protected_fields trigger).
- PASS Care worker API surface: company audit export -> 403; colleague evidence pack
  -> 404 "cannot access it"; colleague evidence + evidence_files -> 0 visible at the
  DB (record-scoped, not company-scoped); on-call export -> 403. The register and
  invoicing exports return 200 but RLS-empty (0 invoices, her own 1 record); NOTE
  (Low) those two export routes could role-gate for consistency, but leak nothing.
- PASS Cross-tenant + anon already covered above.

### Data / files / privacy

- File routes (evidence, policies, training, assignments) read through the RLS
  client AND re-check company_id; served via 5-minute signed URLs; downloads
  audit-logged; policy/evidence streams are `private, no-store`. Live signed-URL
  expiry + cross-tenant file fetch: PENDING.

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
  NOTE (Low, to confirm) HTML email templates interpolate user-controlled names into
  markup; self-scoped (a company injecting into its own managers' emails), low impact,
  worth confirming the values are escaped.
- (Cron/webhook code notes retained above; all proven live this session.)
- Server-side validation: form submissions go through validateAnswers server-side
  in submit_evidence and the public-form path; client validation is not relied on.
- Stripe CLI: the security-critical webhook behaviour (bad/forged signature -> 400,
  fail-closed -> 503) is proven without it; a live valid-event idempotency run via
  the CLI is optional and logged as a functional check, not a security blocker.
