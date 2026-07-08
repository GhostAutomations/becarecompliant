# Be Care Compliant — Master Phase Plan

Source of truth for the build. The Phases progress box mirrors this list; the Phase Progress box shows only the current phase's tasks. Agreed with Phil on 2026-07-07.

Standing decisions taken at planning:

- Forms engine and evidence storage ship BEFORE the People compliance loop, because a check is only satisfied by completing a form. The form builder UI comes later as its own phase.
- Notifications and usage metering ship before Billing, because Diamond tier billing depends on accurate SMS/AI metering already existing.
- Brand: same family as Join Care Now. Deep navy base (#081231 / #0d1d4b / #14306b) with the same gold accent at the rich amber end (#f59e0b primary, never light yellow). RAG colours are first-class palette members.
- Dark app theme (Phil, Phase 0 sign-off): all app screens are dark, navy gradient surfaces with dark glass cards (bg-white/10 + blur) and light text. Light glass app screens were rejected as too white; do not reintroduce.
- Supabase org upgraded to Pro to allow the third active project (becarecompliant, eu-west-2, ref bgrtcvyjuwopunpnudeu).

## Phase 0 — Foundations  ✅ COMPLETE (confirmed by Phil 2026-07-08, checklist 14/14)

- PHASES.md master plan
- Next.js 15 + TypeScript + Tailwind v4 scaffold, repo `becarecompliant`
- Supabase project (eu-west-2, London)
- Migration 0001: companies, branches, profiles/roles, user_sessions, RLS helpers (is_company_member / is_company_admin / is_platform_admin)
- Supabase Auth wired with guard helpers (requireUser / requireCompany / requireCompanyAdmin / requirePlatformAdmin)
- Single-session groundwork: user_sessions table, claim_session RPC, guard-enforced one active session per user
- Design system: canonical form controls in globals.css, glass cards, navy+gold palette, RAG colours, status pills, buttons
- Styled login screen (navy + gold)
- Dashboard shell: frosted topbar, gradient sidebar with dock-style navigation, app-grid, People and Service Users placeholder entries
- Vercel project + becarecompliant.com (www canonical)

## Phase 1 — Multi-tenant core  ✅ COMPLETE (confirmed by Phil 2026-07-08, core tested live; remaining checks logged to Final Testing)

Companies CRUD (founder-led creation), branches (1 Team + 1 Branch included, extra branches as paid add-on later), profiles and the five roles, invite-only onboarding (branded Resend emails, resend button on pending invites), permission boundaries confirmed by popup per feature area then enforced in RLS, audit log groundwork, seat-count groundwork.

Agreed decisions (2026-07-08 popups):

- Permission boundaries (RLS-enforced): Supervisor sees only their assigned caseload (no whole register); form sign-off = Managers approve any in their branch(es), Supervisors only within caseload, Team Members submit but never approve; user admin (invite, roles, seats) is Company Admin only; Team Member sees only their own record and own tasks, never other records or any service user data.
- Branch mapping: `user_branches(user_id, branch_id)` join table for non-Admin roles (Managers get multiple rows). Company Admin + Platform Admin implicitly all branches.
- Audit log: append-only `audit_log` table + shared `writeAudit()` helper, wired into company/branch/user/role/invite events this phase.
- Seat counting: live active-user count function + read-only "seats used / included / extra billable at £5" display in Admin. No Stripe this phase (Phase 7).
- Invite email: Resend, sending identity `no-reply@mail.becarecompliant.com` (dedicated mail subdomain), branded CTA button, resend button on pending invites. DKIM+SPF+DMARC DNS walkthrough for `mail.becarecompliant.com`.

Build order: migration 0002 (user_branches, invites, audit_log, seat count fn, RLS helpers/policies) → companies CRUD (founder) → branch management (Admin) → users & invites (Admin) + Resend → audit + seat display → DNS walkthrough → Phase 1 test checklist.

## Phase 2 — Forms engine & evidence  ✅ COMPLETE (confirmed by Phil 2026-07-08; deployed, seeding tested live, remaining checks logged to Final Testing)

Schema-driven form renderer (shared helper used everywhere), form versioning, immutable evidence storage (timestamps, author, form version), founder-curated template seeds for new companies. No authoring UI yet. GDPR: evidence retention design.

Agreed decisions (2026-07-08 popups):

- v1 field types (full set): short text, long text, number, date, single select, multi select, radio, checkbox, section heading, signature, file upload, plus conditional logic (visibleWhen). Renderer built complete so later phases never reopen it.
- Schema shape: sections then fields. `{ schemaVersion, sections: [ { id, title, description?, fields: [ { key, type, label, required?, help?, placeholder?, options?, validation?, visibleWhen? } ] } ] }`.
- Versioning: immutable `form_versions` (form_id, version, schema, status). Evidence pins `form_version_id` AND embeds a `schema_snapshot`, so evidence renders identically forever.
- Evidence: immutable, append-only. Single jsonb `answers` snapshot per submission + author + timestamp + pinned version. Written only via SECURITY DEFINER `submit_evidence`; no UPDATE/DELETE policy.
- PDF-as-evidence (Phil mid-phase request, folded into Phase 2): on submission the completed form renders to a branded PDF stored immutably in the private bucket as the inspector-facing evidence, alongside the jsonb snapshot. Generated + uploaded first, then the row is inserted in one shot with pdf_path + pdf_sha256. Engine: @react-pdf/renderer (new dependency).
- Master template library: platform-curated `form_templates`; each company seeds its own copies via idempotent `seed_company_form_templates(cid)`. Founder chose the Broader 8 starter set: supervision, appraisal, spot_check, competency_assessment (people); care_plan_review, risk_assessment, mar_audit, consent_review (service users).
- Private `evidence` Storage bucket; 5-minute signed URLs; every download audit-logged (evidence.downloaded).
- GDPR retention: default minimum 8 years from a record's end of care (IGA/NHS Records Management Code, cited); anonymise on expiry, hard delete only on verified SAR erasure. `anonymise_evidence` + `sar_evidence_for_subject` + `backfillRetentionForRecord` groundwork shipped; full wiring in Phase 3/4/8.

Build state: migration 0003 applied (forms, form_versions, evidence, evidence_files, form_templates, bucket, RLS, RPCs) to ref bgrtcvyjuwopunpnudeu only; 8 master templates seeded; Thistle Care Wales seeded (8 forms). Shared renderer (components/forms/form-renderer.tsx), validator (lib/form-validate.ts), schema types (lib/form-schema.ts), formatter (lib/form-format.ts), evidence pipeline (lib/evidence/pdf, storage, submit, retention) built; seeding wired into founder company creation. NOT yet deployed (needs npm install for @react-pdf/renderer). No submission UI (that is Phase 3).

## Phase 3 — People section  🔨 IN PROGRESS (scope agreed by popup 2026-07-08)

People records and register per branch, checks attached to records with recurrence rules, recurrence engine (Europe/London, month boundaries, leap years, tested not assumed), RAG statuses with configurable amber threshold, rollups check → record → register → branch → company dashboard, complete-form-satisfies-check loop end to end, archived records and leavers excluded everywhere.

Agreed decisions (2026-07-08 popups; Phil shared his live Monday "Team Compliance NP / Compliance Matrix" board as the target look):

- Person record = identity + employment only (full name, job title, branch, status active/leaver, start date, leaver date, work email, mobile) plus optional line Manager / Team Leader / Team assignment fields. DBS, right to work, training etc. are Checks, never record columns. Kept distinct from Service Users in UI + data model.
- Check model: company `check_definitions` (name, linked Form or capture kind, default recurrence, amber override, applies-to people) → per-record `check_instances` (due_date, status, last_completed). One-off checks supported (probation / 3-month review).
- Two check kinds: (1) Form-completion checks → complete a seeded Form → Evidence (supervision, appraisal, spot check, competency); (2) document/date checks → record a renewal/expiry date + optional upload, expiry-anchored (DBS, Enhanced DBS, Right to Work, Manual Handling refresher). Both produce Evidence.
- Recurrence anchor: next due = actual completion date + interval (drift-free), PLUS expiry-anchored mode (due = document expiry minus a lead time). Rule shape { frequency, interval, anchor: completion|expiry, leadDays? }. This is the Monday-automation behaviour Phil asked for: completing/renewing auto-advances the check.
- Recurrence engine: one shared, unit-tested module (Europe/London, month boundaries, leap years, DST). Clears the Final Testing date-maths item.
- RAG amber: company default 30 days, overridable per check definition. Server-computed for correctness.
- Rollup check → record → register → branch → dashboard: server-computed RAG + one shared Supabase Realtime helper (unfiltered subscribe, REPLICA IDENTITY FULL, poll fallback). Also delivers the parked Additions live-list item.
- Default recurrences (cited sector norms, editable): Supervision 3mo, Appraisal 12mo, Spot Check 3mo, Competency 12mo, DBS ~36mo (expiry-anchored), Right to Work expiry-anchored, Manual Handling refresher 12mo. Definitions auto-apply to each new Person from start date, idempotent.
- Register presentation: dense compliance matrix (sticky Carer column, core employment columns, one RAG cell per Check with next due + last completed). Sort/filter/group, horizontal scroll desktop, stacked cards mobile, dark navy/gold, canonical controls. One column per Check (not Sup 1/2/3); full cycle history in the record drill-down.
- Leavers + archived excluded from active register, rollups, reminders, reports; separate Leavers/archived view for audit history. Completed check = green + completion date. Empty states everywhere.
- Permissions (RLS): Manager = full register for their branch(es); Supervisor = assigned caseload only (`person_assignments`); Team Member = own linked record only (`person.profile_id`); Admin/Platform = all. Tighten Phase 2 evidence reads to match now records exist.
- Research cited (July 2026): CQC SAF operational across providers by end 2026, no prescribed supervision cadence (sector norm quarterly + annual appraisal); DBS no statutory expiry (providers renew 1–3 yrs or Update Service); right to work follow-up before time-limited permission expires.

Build order: recurrence engine (+ tests) → migration 0004 (people, check_definitions, check_instances, person_assignments, RAG view/fns, RLS, seed people catalogue; ref bgrtcvyjuwopunpnudeu only) → register matrix UI → record drill-down → check config/assignment → complete-Form-satisfies-Check via submitEvidence(record_type='person') → RAG rollups + realtime → leaver/archived exclusion → deploy + test checklist.

## Phase 4 — Service Users section

Same loop for service users, SU-specific check types and templates (care plan reviews, risk assessments, MAR checks, consent reviews), special-category data handling: access audit logging (reads, not just writes), strict role isolation (Team Members never see service user data unless assigned), discharged service users excluded everywhere.

## Phase 5 — Form builder

Authoring UI: field types, required fields, validation, conditional logic, signatures, file uploads, version history. Founder template library curation. AI-assisted form generation is NOT in this phase, ask Phil first.

## Phase 6 — Notifications & reminders

Email (Resend, branded CTA buttons only, DKIM+SPF+DMARC walkthrough) and SMS (Twilio) reminders and chasers for due and overdue checks. Usage metering per company per month (SMS + AI) from the first send. Excluded: archived/discharged records never get reminders.

## Phase 7 — Billing & tiers

Ask Phil (popup) before building: tier contents for Business/Pro/Enterprise are TBC. Fixed: 4 included users + £5/extra user/month on subscription tiers, Diamond is usage-only, Black is free and founder-granted with no Stripe subscription. Stripe products, exact seat metering, Billing page with seat usage and cost, server-side tier gating, single-session polish (clear signed-out-elsewhere UX everywhere).

## Phase 8 — Reporting & exports

PDF + CSV export helpers (shared, routed through one module), inspection-ready evidence packs, register and branch compliance reports, audit trail views. Format a manager can hand to a CQC/CIW inspector.

## Phase 9 — Founder console

Cross-company: companies, users, billing and revenue, template library curation, audit logs, platform statistics, error console, manage-as-company mode.

## Phase 10 — Additions

Ideas that arrive mid-phase get parked here (popup decides: current phase or Additions).

- Edit an existing user's branch assignment (reassign or add branches) from the Users screen. Phase 1 sets a user's branch at invite time only; changing it later is not yet built.
- Live-updating Users/invites list: when an invite is accepted, the pending and team lists on Settings > Users should update instantly with no refresh. Build as part of one shared Supabase Realtime helper when the People register needs live RAG rollups (Phase 3). Groundwork (REPLICA IDENTITY FULL on invites/profiles) already in place. (Phil request, parked 2026-07-08.)

## Phase 11 — Final Testing

Anything not tested at build time is logged here immediately with enough detail to test cold.

- Recurrence engine date maths: month boundaries, leap year, Europe/London DST transitions. DONE 2026-07-08: shared engine lib/recurrence.ts unit-tested 19/19 in the sandbox (31 Jan +1mo, 29 Feb +1yr, day/week/month/year intervals, expiry-anchor, RAG thresholds, London late-evening BST rollover, spring/autumn DST instants, month interval across a DST change). Re-run with `npm test`.
- Phase 0 canonical form controls cross-browser: select chevron, checkbox tick, radio dot, range slider on Safari (macOS + iOS), Chrome, Firefox. Styled centrally in app/globals.css @layer base. (Edge on macOS passed 2026-07-08.)
- Phase 0 RAG pill contrast: measure green/amber/red pills against WCAG AA on the DARK glass cards (soft 100-strength chips with 800-strength text on bg-white/10 over navy).
- Phase 0 public paths: /api/webhooks/* must be reachable without a session once the first webhook exists (PUBLIC_PATHS in lib/supabase/middleware.ts). Auth redirect matrix otherwise passed live 2026-07-08 (checks 11 to 13).
Phase 1 tested live 2026-07-08 (env configured, deployed). PASSED end to end: founder company create + Team/Branch seeding; founder -> first Admin invite -> branded Resend email received -> /auth/confirm (verifyOtp) -> /welcome set password -> active company_admin; Admin -> Team Member invite into Newport -> accept -> team_member active with user_branches assignment; audit rows for company.created/invite.created/invite.accepted; Resend and Revoke; seat count at 1 and 2 users; nav shows Settings (not Founder) for an Admin; company_active_user_count returns null for a non member context (anti-leak guard). Root cause found and fixed during testing: SUPABASE_SERVICE_ROLE_KEY must be the sb_secret_ key AND a redeploy is required after changing a Vercel env var.

Still to test cold (logged from Phase 1):
- Cross-tenant RLS isolation: with two companies, a user of A cannot read B's companies/branches/profiles/invites/audit_log.
- Company Admin cannot mint another Company Admin (UI only offers non-admin roles; RLS invites_insert enforces it) — confirm by attempting a crafted request.
- audit_log append-only: no update/delete via the API.
- Single-session through the invite accept flow: accepting on a second device signs the first out with the clear message.
- Seat billing display at 5 and 6 active users (extra users at £5/mo).
- Team Member data isolation (sees only own record/tasks, no service user data) — needs the People/Service User screens, so verify in Phase 3/4.

Logged from Phase 2 (forms engine & evidence). Verified by the agent: migration 0003 applied to the correct ref only; 8 master templates seeded; seeding idempotent (Thistle stayed at 8/8); validator unit tests 14/14; new tables all have RLS with policies; typecheck clean bar the pre-install @react-pdf module. Phase 2 deployed live 2026-07-08 (commit 7a2678e, build green). PASSED live: Founder company create seeds 8 starter forms (4 people, 4 service users), note reads "8 starter forms were added", company.created metadata has forms_seeded: "8" (verified in DB on company "Phase 2 Test"). Gotcha seen: a company created during the ~build window ran the old code and got 0 forms; timing, not a bug, retry after READY seeded correctly. Two throwaway test companies exist from this ("Test Company Phase 2" with 0 forms, "Phase 2 Test" with 8) plus pending invites; archive/delete when convenient.
Still to test cold:
- Cross-tenant RLS on forms/form_versions/evidence: a member of company A cannot read B's forms or evidence; form_templates readable only by the Founder (needs two tenants + real user sessions).
Cold in Phase 3/4 (needs the submission UI, which does not exist in Phase 2):
- submit_evidence writes exactly one immutable evidence row (answers snapshot + pinned form_version_id + embedded schema_snapshot); branded PDF generated at submission, stored in the private bucket, pdf_sha256 + pdf_bytes recorded.
- Evidence excludes conditionally hidden fields at submit (server cleanAnswers); evidence has no UPDATE/DELETE via API; same-evidenceId retry is idempotent (duplicate: true, no second row).
- submit_evidence rejects a non-member of the company and a non-member of the given branch.
- Evidence download returns a signed URL expiring after 5 minutes and writes an evidence.downloaded audit row; the bucket is private (no unsigned access).
- Signature stored as PNG data URL then uploaded as a signature attachment; file_upload stored with sha256.
- anonymise_evidence (Admin/Platform only) blanks answers/author/PDF, flags files purged, removes storage objects, writes evidence.anonymised; backfillRetentionForRecord sets retention_until to end of care + 8 years.
- Renderer live: every v1 field type renders via the canonical controls, conditional show/hide works live, required markers + inline validation errors show, and it works on mobile.
- record-level evidence read tightening (Supervisor = own caseload, Team Member = own record only) to be added when records exist in Phase 3/4; current evidence_select scopes to platform/company_admin/branch member/author.

Logged from Phase 3 (People). FULLY BUILT + typecheck clean (tsc --noEmit, sandbox) 2026-07-08; next build must run on Phil's machine (sandbox cannot download the SWC binary, npm registry blocked). Migrations 0004 + 0005 applied to ref bgrtcvyjuwopunpnudeu only; advisors show only the accepted SECURITY DEFINER / leaked-password WARN posture, no missing-RLS findings. Existing tenant Thistle Care Wales backfilled to 12 forms + 8 People checks. Includes the check-definition editing screen (/people/checks) and the live RealtimeRefresh helper (people + check_instances added to the supabase_realtime publication in 0005). Run TEST-CHECKLIST-PHASE3.md as a popup checklist once deployed.

BACKEND LOOP VERIFIED at the DB level 2026-07-08 (JWT-impersonated Admin in Thistle, then cleaned up): apply_person_checks applied all 8 checks and was idempotent on re-run; submit_evidence wrote exactly one immutable evidence row (record_type='person'); complete_check advanced Supervision to completion + 3 months (2026-10-08), stamped completion, linked evidence, and was idempotent on the same evidence id; person_rollup/person_check_status computed RAG correctly (2 red, 5 green, right-to-work none) and excluded a leaver (0 rows); check_rag past/soon/far = red/amber/green. Recurrence engine unit tests 19/19 via `npm test`.

Still to test cold (Phase 3, needs deploy + extra roles/tenants):
- The full TEST-CHECKLIST-PHASE3.md end to end on the deployed build (records, the complete-Form-satisfies-Check loop, next-due maths live, RAG rollups, leaver/archived exclusion).
- Permission matrix live: Manager (branch register), Supervisor (caseload only via person_assignments), Team Member (own linked record only, redirected from /people, no service user data). Needs a Manager, a Supervisor and a Team Member in Thistle.
- Evidence read tightening (0004): a non-manager branch member cannot read evidence outside their caseload/own record (Phase 2 read was broader). Needs the roles above.
- Phase 2 items now testable through the new submission UI: submit_evidence writes exactly one immutable evidence row + branded PDF in the private bucket + pdf_sha256; conditionally hidden answers excluded at submit; 5-minute signed-URL download is audit-logged; signature currently stored in the answers snapshot, NOT yet as a separate signature attachment (deferred).
- Cross-tenant RLS on people/check_definitions/check_instances/evidence with two companies.
- DBS Renewal / Manual Handling / Right to Work document checks: completing captures the date + optional upload and reschedules correctly (right to work expiry-anchored, DBS 36mo, manual handling 12mo).

## Phase 12 — Marketing & Launch

Marketing site on becarecompliant.com, onboarding collateral, subscription agreement (no data selling clause), launch.
