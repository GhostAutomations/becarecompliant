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

## Phase 3 — People section  ✅ COMPLETE (signed off by Phil 2026-07-09; remaining checks logged to Final Testing)

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
- Permissions (RLS): Manager = full register for their branch(es); Supervisor = assigned caseload only (`person_assignments`); Admin/Platform = all. Team Member = READ ONLY viewer of their assigned branch register (updated 2026-07-08, migration 0006, `is_branch_team_member`), no write, no completing, no Evidence content; supersedes the old own-record-only rule. Records are never BCC accounts: the manual "linked user" field was removed; `people.profile_id` stays dormant for the future Join Care Now auto-link. Tighten Phase 2 evidence reads to match now records exist.
- Research cited (July 2026): CQC SAF operational across providers by end 2026, no prescribed supervision cadence (sector norm quarterly + annual appraisal); DBS no statutory expiry (providers renew 1–3 yrs or Update Service); right to work follow-up before time-limited permission expires.
- Supervision cycle (Phil, 2026-07-09, "restart the cycle"): Sup 1/2/3 are a rolling annual cycle. The cycle anchor = the LATER of the last Annual Appraisal completion and the successful (actual) probation end. Sup 1 due = anchor + supervision interval; Sup 2/3 due = previous supervision completion + interval. Completing an Annual Appraisal moves the anchor forward, so Sup 1/2/3 reset to empty and Sup 1 becomes due (appraisal completion + interval). Only a completed Annual Appraisal restarts the cycle (drops completions on/before the last appraisal, so Sup 1/2/3 reset); the probation end only sets year-one's Sup 1 due and never hides supervisions dated before it. Sup 1 due anchors on the LATER of the last appraisal completion and the probation end. Display via supervisionSlots (appraisal + probation dates passed in) in lib/people/logic.ts. Supervision completion date = the "Date of supervision" entered on the form (not submit time), stamped on the check and used for the next-due anchor and the Sup slot comp date. When the Annual Appraisal is in "After Supervision 3" mode, completing Supervision 3 (supervision_type = 3) schedules the appraisal due one supervision interval after the Sup 3 completion (Phil, 2026-07-09), via SECURITY DEFINER RPC set_person_check_due (migration 0023) from completeCheck. In after_sup3 mode the appraisal does NOT self-schedule on its own completion (nextDueAfterCompletion returns null); it is re-scheduled only when the next cycle reaches Sup 3, so AA next due is blank between an appraisal completion and the next Sup 3. (Yearly mode self-schedules as normal.) RAG stays correct: completing an appraisal also re-anchors the person's supervision check_instance (due = appraisal completion + interval, last completion cleared) via SECURITY DEFINER RPC reanchor_supervision_cycle (migration 0020), called from completeCheck when def.key = 'appraisal'. So the register/record Sup 1/2/3 display and the overall RAG rollup both restart together.

Build order: recurrence engine (+ tests) → migration 0004 (people, check_definitions, check_instances, person_assignments, RAG view/fns, RLS, seed people catalogue; ref bgrtcvyjuwopunpnudeu only) → register matrix UI → record drill-down → check config/assignment → complete-Form-satisfies-Check via submitEvidence(record_type='person') → RAG rollups + realtime → leaver/archived exclusion → deploy + test checklist.

## Phase 4 — Service Users section  ✅ COMPLETE (signed off by Phil 2026-07-10; full testing deferred to Final Testing)

Open decision parked for the next Complex-review pass (Phil, 2026-07-10): when Review 4 is completed, should the four Review cards (A) stay visible as completed until the next review starts a fresh cycle, or (B) blank immediately with Review 1 showing its new due date. Currently B (reset on the 4th completion, positional model). Phil leaned towards A but did not finalise; revisit if he raises it. Also deferred: the Planned Review Date reviewer calendar-invite email (Phase 6) and the full TEST-CHECKLIST-PHASE4.md run (Final Testing).

Phase 4 as originally scoped (agreed by popup 2026-07-09):

Same loop for service users, SU-specific check types and templates (care plan reviews, risk assessments, MAR checks, consent reviews), special-category data handling: access audit logging (reads, not just writes), strict role isolation (Team Members never see service user data unless assigned), discharged service users excluded everywhere.

Agreed decisions (Phil, 2026-07-09; full brief in PHASE-4-BRIEF.md):
- Reuse Phase 3 heavily: register matrix, Views + Branches dropdowns (same instant client-side switching), record drill-down, compliance loop, forms engine, recurrence engine, realtime, toast, back links, branch auto-fill on Add, RLS + SECURITY DEFINER patterns, activity-date completion, client redirect, on-demand PDF.
- Service User record: name (Service User), ssid (Social Services ID), package_start_date, service_status enum (active/hospital/respite/cancelled), branch. Special-category health data.
- Main table columns (in order): Service User, Package Start Date, SSID, Status (pill: Active/Hospital/Respite/Cancelled), Most Recent Review, New Review Due, Planned Review Date, Review Status (pill: Awaiting Review/Booked In/Overdue). Review columns only; risk assessment / MAR / consent live in the record drill-down.
- Views: Main (Active) + Hospital + Respite + Cancelled + Summary. Cancelled behaves like Leavers (excluded from active register/rollups/dashboard/reminders, kept for audit). Status pill moves between views instantly.
- Review workflow: primary check = Care Plan Review (recurring). Most Recent Review = last completed; New Review Due = last + interval; Planned Review Date = booked date. Review Status AUTO-DERIVED: Overdue when New Review Due has passed; Booked In when a Planned Review Date is set (and not overdue); Awaiting Review otherwise.
- GDPR: access audit logging on READ of a Service User record and its evidence (not just writes); strict role isolation; Team Members excluded unless assigned.

Carry over from Phase 3 (Phil, 2026-07-09): the Service User register must update LIVE like the People register. Mount RealtimeRefresh and subscribe to every table a completion touches for service users (the service_users record table, its check_instances rows, and any SU tracker table equivalent to person_trackers), each with REPLICA IDENTITY FULL and in the supabase_realtime publication. Realtime is the primary path (sub-second); keep the short (10s) poll fallback. A check_instances change already refreshes Evidence-derived slots, so Evidence itself stays unpublished. Also carry: completion date = the activity date entered on the form (not submit time); never redirect() from a Server Action to a URL with a query string (client router.replace via ActionState.redirectTo); Saving button state held through the redirect.

Extra decisions taken at kickoff (Phil, 2026-07-09/10):
- Schema reuse = "same as People": Service User checks + evidence live in the SHARED check_instances + evidence tables (both already had record_type in ('person','service_user')); 0027 adds a service_user_id column + parallel SU views/RPCs, and complete_check was generalised to authorise either population. No parallel compliance engine.
- Planned Review Date is a BOOKING, not just a date. Clicking the cell opens a calendar + reviewer selector; booking sets planned_review_date + planned_reviewer_id (on service_user_trackers) and derives Review Status to "Booked In". Completing a Care Plan Review clears the booking.
- The reviewer calendar-invite EMAIL (branded Resend email with an .ics attachment so the reviewer can add it to their phone/Outlook calendar) is DEFERRED to Phase 6 Notifications (Phil chose "booking now, email in Phase 6, remember to come back and test"). Booking + Booked In status ship in Phase 4; the email + .ics does not.
- SU review defaults (editable, cited UK sector norms): Care Plan Review 12mo, Risk Assessment 12mo, MAR Audit 1mo, Consent Review 12mo. Amber default 30 days. Only Care Plan Review drives the register review columns; the rest live in the drill-down.
- Team Member isolation is stricter than People: NO branch-wide Team Member read for Service Users (special category). A Team Member only sees a Service User when explicitly assigned (service_user_assignments, via is_service_user_supervisor).

Build state (2026-07-10): FULLY BUILT + typecheck clean (tsc --noEmit, sandbox). Migrations 0027 (SU schema, check_instances.service_user_id, SU views/RPCs, RLS, seed) + 0028 (realtime publication + idempotent SU-check backfill; fixed an amber_days::int cast) applied to ref bgrtcvyjuwopunpnudeu ONLY. Thistle Care Wales backfilled to 4 SU checks. New shared primitives: components/register/pill-select.tsx + horizontal-scrollbar.tsx (People matrix refactored to import them, so one implementation drives both registers) and RealtimeRefresh generalised to take tables + channel props (People default unchanged). New: lib/service-users/{types,data,logic,actions}, components/service-users/*, /service-users (register + new + [id] + [id]/checks/[instanceId]/complete + summary), Settings > Service Users (check config reuses CheckConfigForm + SU column names). Dashboard shows a People strip and a Service User strip, both live, cancelled excluded. DB smoke test (service role) confirmed the SU views compute RAG (overdue -> red), tracker auto-creates on insert, and cascade delete cleans up. NOT yet deployed at time of writing; needs the Vercel push. Run TEST-CHECKLIST-PHASE4.md as a popup checklist once deployed.

## Phase 5 — Form builder  ✅ COMPLETE (confirmed by Phil 2026-07-11; remaining cold checks logged to Final Testing)

Authoring UI: field types, required fields, validation, conditional logic, signatures, file uploads, version history. Founder template library curation. AI-assisted form generation is NOT in this phase, ask Phil first.

REUSE, do NOT rebuild (Phase 2 engine): schema types lib/form-schema.ts (FormSchema { schemaVersion, sections:[{ id, title, description?, fields:[{ key, type, label, required?, help?, placeholder?, options?, validation?, visibleWhen? }] }]}), shared renderer components/forms/form-renderer.tsx (live preview just mounts it), validator lib/form-validate.ts (cleanAnswers/validateAnswers), formatter lib/form-format.ts, evidence pipeline (immutable evidence, pinned form_version_id + embedded schema_snapshot, on-demand branded PDF). Tables already exist: forms (company copy: key, name, population, status, source_template_key, current_version), form_versions (immutable: form_id, version, schema, status draft|published|archived, created_by), form_templates (founder master). Existing RLS: company forms/form_versions authoring = Company Admin only; form_templates = Platform Admin (Founder) only.

Agreed decisions (Phil, popups 2026-07-10; all recommended options):
- Scope: Phase 5 ALSO unlocks creating brand new CHECK TYPES tied to a form built here, via the EXISTING Settings check config (extend it, no parallel UI), so a newly built form can be used in the compliance loop.
- Curation split (RLS-enforced, matches current RLS): Founder edits the platform master form_templates seed library with the same builder (/founder); Company Admins author/edit only their own company forms; Managers/Supervisors/Team Members read and complete only.
- Draft vs publish: editing a published form spins up a NEW DRAFT version (edit + preview); Publish promotes it to current_version; one draft may coexist alongside the live published version; existing evidence never changes. Enforced by SECURITY DEFINER RPCs (pinned search_path, ownership-guarded) so a published version is NEVER mutated in place.
- New forms: Company Admins can create a brand-new blank form, DUPLICATE any existing form as a starting point, and edit the 8 seeded forms.
- Placement: forms list + builder live under Settings (/settings/forms), alongside check config/branches/users. Founder master curation is built in THIS phase (reusing the same builder).
- AI-assisted form generation: explicitly NOT in this phase (do not build; ask Phil first if it comes up).

Build order (9 tasks, agreed): migration 0038 version-lifecycle RPCs (create_company_form blank|duplicate, create_form_draft clone-current, save_form_draft draft-only, publish_form_version promote+archive, discard_form_draft; founder form_templates equivalents; ref bgrtcvyjuwopunpnudeu ONLY + numbered SQL file) -> lib/form-builder/{types,data,actions} (ActionState + client router.replace, "use server" async-only) -> /settings/forms list (population, current version, Draft badge, empty state, Back link, New/Duplicate/Edit) -> builder UI components/form-builder/* (sections+fields add/remove/reorder, per-field config incl. options/validation/visibleWhen, signature + file upload; canonical controls only) -> live preview (mount FormRenderer, submit disabled) -> draft->publish flow + version history -> new check type via extended check config (People + Service Users) -> founder master template curation -> typecheck + deploy verify + TEST-CHECKLIST-PHASE5.md popups, log untested to Final Testing.

WAVE 2 (Phil, 2026-07-10, after reviewing the Join Care Now FORM-BUILDER-SPEC.md and choosing "best bits"): folded into Phase 5. Added (all chosen): builder ergonomics (HTML5 drag reorder of fields + sections with arrows kept as fallback; insert a field at any position via a + between fields; content outline jump list, two-column edit layout); new field types time, email, phone, rating (stars), address (structured), yes_no (reopened the Phase 2 engine: lib/form-schema AnswerValue + AddressValue helpers, lib/form-validate, lib/form-format, components/forms/form-renderer, lib/evidence/pdf.tsx all extended); and a founder-curated QUESTION BANK (migration 0040 question_templates, global, RLS read=any authenticated member / write=platform admin; /founder/question-bank curation; a From question bank tab in the add-field menu, filtered by form population). Explicitly NOT taken from JCN (deferred): AI generate / PDF import (Phil's brief excludes AI this phase; roadmap slice) and the paid template store with Stripe (Phase 7 Billing). We keep our immutable-version model over JCN's continuous-autosave-no-versions, and our visibleWhen (multi-value) over JCN's single parent_value.

BUILD STATE (2026-07-10): FULLY BUILT + typecheck clean (tsc --noEmit, sandbox), recurrence tests 19/19; next build must run on Phil's machine (sandbox cannot build/push). Wave 2 adds migration 0040 (question_templates, applied to ref bgrtcvyjuwopunpnudeu only, RLS on + 4 policies, advisors clean). New/changed files wave 2: lib/form-schema.ts (new FieldTypes + AddressValue/ADDRESS_PARTS/isAddressValue/addressIsEmpty/formatAddress), lib/form-validate.ts + lib/form-format.ts (new types), components/forms/form-renderer.tsx (RatingStars, AddressFields, yes_no/time/email/phone), lib/evidence/pdf.tsx (via formatter), lib/form-builder/{types(BankQuestion/BankQuestionRow, anchor-id helpers, palette),schema-ops(insertField/reorderFieldInSection/reorderSection/insertFieldFromBank),data(listQuestionBank/listAllQuestionTemplates),actions(question-bank CRUD)}, components/form-builder/{insert-field-menu,content-outline,question-bank-manager}.tsx + section-editor/builder-shell/field-editor updated, app/(app)/founder/question-bank/page.tsx, both builder pages pass bank, founder console has Question bank tile. Field types engine reopening + question bank logged to TEST-CHECKLIST-PHASE5.md (sections G/H/I) and Final Testing.

BUILD STATE (2026-07-10): FULLY BUILT + typecheck clean (tsc --noEmit, sandbox); next build must run on Phil's machine (sandbox cannot build/push). Migrations 0038 (version-lifecycle RPCs) + 0039 (create_check_definition_with_form) applied to ref bgrtcvyjuwopunpnudeu ONLY, saved as numbered SQL files. DB smoke tests (JWT-impersonated Thistle Admin, cleaned up): 0038 full lifecycle passed (create -> save draft -> publish -> new draft clone -> draft idempotency -> published-version immutability rejection -> second publish -> discard -> cleanup); 0039 passed (new check def created + backfilled every active Person with a blank due, count matched, idempotent). Advisors: 0 ERROR, no missing-RLS, same accepted WARN posture. New code (all in repo): lib/form-builder/{types,schema-ops,data,actions}.ts; components/form-builder/{builder-shell,section-editor,field-editor,version-history,new-form-button,template-library}.tsx; components/people/create-check-type-form.tsx; app/(app)/settings/forms/{page,[id]/page}.tsx; app/(app)/founder/forms/{page,[id]/page}.tsx; createCheckType added to lib/people/actions.ts; Forms tile on Settings; Form template library tile on Founder console; check config extended on both Settings > People and Settings > Service Users (replaced the "later phase" note). Reused Phase 2 engine unchanged: lib/form-schema.ts, components/forms/form-renderer.tsx (live preview mounts it), lib/form-validate.ts, lib/form-format.ts, evidence pipeline. NOT yet deployed at time of writing: Phil pushes -> Vercel builds -> then run TEST-CHECKLIST-PHASE5.md as popups. Sign-off pending Phil's confirmation after the checklist.

## People extension — Holidays & Absence  ✅ CORE FLOWS TESTED & PASSED (2026-07-11; cold checks logged to Final Testing)

Two sub-sections nested UNDER People in the sidebar (People stays the main register; Holiday and Absence sit beneath it). Built now as an extension of the Phase 3 People section, reusing its patterns (RLS helpers, register shell, forms + immutable Evidence, back links, realtime).

Agreed decisions (Phil popups 2026-07-11):
- Sidebar: under the "People" nav item sit "Holiday" and "Absence" child links. Clicking People = the existing register. (Nav must gain nested children: extend lib/nav NavEntry with an optional children[] and render an expandable group in components/app-nav.tsx + the mobile dock.)
- ABSENCE view: branch cards showing ONLY people who have absences recorded against them, each card showing their current stage / action. No cards for people with no absences. Absences are recorded by a Manager/Admin against a Person record (person_id), completing the Absence Back Office form as immutable Evidence. When a threshold is crossed, an Absence Management Meeting is recorded (Stage 1 to 4) as Evidence.
- HOLIDAY view: NOT cards. A requests strip at the top (pending requests to approve/decline) and, beneath it, a calendar showing people's approved holidays for the branch. Team Members submit their own holiday request (Holiday Form -> Evidence); a Manager/Admin approves or declines (Holiday Response -> Evidence). NO balance/entitlement tracking for now (approve/deny only); the email approval flow comes with Phase 6 Notifications ("build this into emails later on").
- Behaviour = lifecycle/log, NOT the recurring Check/RAG model. Holiday = request with Pending/Approved/Declined status. Absence = logged events; the current stage/score is AUTO-DERIVED from recorded absences over a rolling window.
- Absence method is a COMPANY SETTING (both supported, company selects): Settings > Absence lets the Admin choose Trigger points (Stage 1 to 4, occasions/days thresholds) or Bradford Factor (S squared x D over a rolling period, action bands), set the thresholds, and UPLOAD the company absence policy (private storage, audit-logged). AI reads the uploaded policy and SUGGESTS the method + thresholds for the Admin to confirm (Phil explicitly chose the AI route, satisfying the brief's ask-before-AI rule; Anthropic API, meter the usage per company like other AI).
- Evidence: every holiday/absence/meeting action generates immutable Evidence through the EXISTING forms already in the founder library (holiday_requests, holiday_response, absence_back_office, absence_management_meeting) via submit_evidence (record_type='person', record_id=person_id). No parallel evidence pipeline. Dedicated tables hold the status/dates/stage.
- Permissions (RLS): Team Member submits + sees only their OWN holiday/absence; Manager approves/declines holidays and records absences for their branch(es); Supervisor = assigned caseload; Admin/Platform = all. Confirmed 2026-07-11.

Known dependency to flag: a Team Member's login is not yet linked to a Person record (people.profile_id is dormant, the manual linked-user field was removed in Phase 3). So a TM holiday request is keyed by requested_by = the user (works for the requests strip + branch calendar via the user's branch), but the per-person Holiday history inside the Person drill-down only populates once the profile<->Person link exists (the future Join Care Now auto-link, or a manual Admin link). Absence is unaffected (Manager records it directly against a Person). Decide the manual-link mechanism with Phil if he wants TM holiday to appear in the Person drill-down before JCN integration.

Data model (migration 0041, ref bgrtcvyjuwopunpnudeu ONLY + numbered SQL file): absence_config (company_id pk, method, rolling_window_days, thresholds jsonb, policy_path, policy_ai_summary, audit cols); holiday_requests (company_id, branch_id, person_id nullable, requested_by, start/end dates, hours nullable, note, status, request_evidence_id, decision_evidence_id, decided_by/at, decision_note); absence_events (company_id, branch_id, person_id, start/end/return dates, days, reason, evidence_id, recorded_by); absence_meetings (company_id, branch_id, person_id, stage 1-4, meeting_date, evidence_id, recorded_by). Plus a view/function person_absence_status(company) computing occasions + days + current stage / Bradford score over the rolling window (branch-scoped, active people only, leavers excluded). RLS mirrors People (is_branch_manager / is_person_supervisor / is_company_admin / requested_by = auth.uid()); approve/decline + record via SECURITY DEFINER RPCs (ownership-guarded, pinned search_path). Policy files in a private bucket with short-lived signed URLs, downloads audit-logged. GDPR: absence reasons can be health data, apply read-audit + isolation.

Build order (tasks tracked in the Phase Progress box): migration 0041 (tables + view + RLS + RPCs + bucket) -> lib/absence + lib/holidays (types, data, actions, the stage/Bradford calc as a pure tested module) -> nested nav (lib/nav children + app-nav group) -> /people/absence view (branch cards, current stage) + record-absence + record-meeting flows (Evidence) -> /people/holiday view (requests strip approve/decline + calendar) + request flow (Evidence) -> Settings > Absence (method + thresholds + policy upload + AI suggest via Anthropic, metered) -> Person drill-down Holiday + Absence history tabs -> typecheck + trace + log untested to Final Testing. NOT deployable from the sandbox; Phil builds/pushes on his machine.

BUILD STATE (2026-07-11): FULLY BUILT (not yet typechecked/built — sandbox cannot npm/build; Phil pushes -> Vercel build is the first compile). Migration 0041 APPLIED to ref bgrtcvyjuwopunpnudeu only (RLS verified on all 4 tables, functions search_path-pinned, view security_invoker) + saved as the numbered SQL file. New code: lib/absence/{logic,data,actions,settings-actions}.ts, lib/holidays/{data,actions}.ts; components/forms/form-evidence-dialog.tsx (reusable "complete a Form as Evidence" slide-over, reused by all four flows), components/absence/absence-view.tsx, components/holidays/holiday-view.tsx (month calendar), components/settings/absence-settings.tsx; app/(app)/people/absence/page.tsx, app/(app)/people/holiday/page.tsx, app/(app)/settings/absence/page.tsx; nested nav (lib/nav children + app-nav group + nav-icon holiday/absence); Settings tile + Person drill-down Holiday/Absence history added. Evidence flows reuse submitEvidence(record_type='person') + getCompanyFormByKey exactly (no parallel pipeline). AI policy parse = Anthropic /v1/messages with the PDF as a base64 document block (no pdf-parse dependency); needs ANTHROPIC_API_KEY + ANTHROPIC_MODEL env (fails closed with a clear message); usage logged to audit (formal per-company AI metering = Phase 6). DEPENDENCY: the four forms only exist in NEW companies (seeded); existing companies (Thistle) need them imported first (the Additions "import master templates into an existing company" item) or the flows show a "form not available" notice and stay disabled. Test checklist: TEST-CHECKLIST-HOLIDAYS-ABSENCE.md. Log untested to Final Testing (below).

## Phase 6 — Notifications & reminders  ✅ COMPLETE (signed off by Phil 2026-07-13; digest send path proven live with both emails received; remaining cold checks logged to Final Testing: holiday emails F1-F4 with public forms, live Twilio SMS, cancel re-run, Teams wording, GMT-season .ics and cron timing, save-button sweep)

Email (Resend, branded CTA buttons only, DKIM+SPF+DMARC walkthrough) and SMS (Twilio) reminders and chasers for due and overdue checks. Usage metering per company per month (SMS + AI) from the first send. Excluded: archived/discharged records never get reminders.

AGREED DECISIONS (Phil, popup 2026-07-11):
1. Delivery = DAILY DIGEST per recipient (one email summarising their due-soon + overdue items), not one email per check. Sent by Vercel Cron at 07:00 Europe/London. Vercel Cron is UTC only, so TWO cron entries (06:00 and 07:00 UTC) with a code gate that only sends when London local time is 07:00; notification_log makes retries/double-fires safe.
2. Recipients = branch Manager(s) + Company Admin get their branch digest; assigned Supervisors get their caseload digest. Individual staff are NOT emailed for compliance. Archived/leaver/discharged/cancelled records excluded everywhere.
3. Channels = Email on by default (Resend). SMS (Twilio) is opt-in per company, overdue escalations only, every SMS metered. SMS path + metering built now even if a company leaves SMS off.
4. Overdue chaser = overdue items always highlighted in the daily digest; separate chaser email to Managers + Admins at 7 and 14 days overdue; if SMS opted in, SMS at 14 days. Thresholds stored in notification_settings (tunable later).
5. Holiday/Absence emails = approver notified on holiday request submission; requester notified on approve/decline. Absence meeting invitations = the .ics item below.
6. Usage metering = usage_events table (company_id, kind sms|ai, occurred_at, units, cost, metadata) + per-company monthly rollup, written on every SMS send and every AI call (absence-policy AI call backfilled into it). "This month" usage read for Admin/Founder.
7. Idempotency = notification_log table; a re-run or cron retry never sends the same reminder twice.

TASK SPLIT (agreed): 6.1 migration 0043 (notification_log, usage_events + rollup, notification_settings, RLS) · 6.2 lib/notifications core (recipients, digest builder from existing RAG views, idempotency, exclusions) · 6.3 digest + chaser templates and cron routes (CRON_SECRET fail closed, vercel.json) · 6.4 .ics generator + SU Planned Review invite + absence meeting invite · 6.5 holiday request/decision emails · 6.6 Twilio SMS (sender, metering, opt-in, escalation, setup walkthrough; env TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM) · 6.7 usage surface (AI backfill, this-month view) · 6.8 TEST-CHECKLIST-PHASE6.md + popup testing.

BUILD STATE (2026-07-11): FULLY BUILT, not yet deployed or tested (sandbox cannot npm/build; Phil pushes -> Vercel build is the first compile). Migration 0043 APPLIED to ref bgrtcvyjuwopunpnudeu only (RLS verified on notification_settings/notification_log/usage_events) + saved as the numbered SQL file; adds profiles.phone (nullable, E.164) for SMS escalation. New code: lib/notifications/{log,usage,data,digest,invites,holiday,settings-actions}.ts, lib/sms/twilio.ts (REST, no SDK; meters num_segments into usage_events on EVERY send), lib/email/ics.ts (all-day VEVENT, METHOD:REQUEST, folded lines); lib/email/resend.ts gained attachments (base64 + content_type, needed for text/calendar); lib/email/templates.ts gained digest/chaser/calendar-invite/notice templates + exported escapeHtml/formatDateUk. Cron: app/api/cron/daily-digest/route.ts (Bearer CRON_SECRET, 503 in prod when unset, 401 on mismatch; ?force=1 test hook), vercel.json crons at 06:00 + 07:00 UTC sharing the path (Vercel supports duplicate paths; x-vercel-cron-schedule header disambiguates) with an isLondonSendHour gate so exactly one run sends at 07:00 Europe/London year round; /api/cron added to middleware PUBLIC_PATHS. Idempotency: every send claims a unique dedupe_key in notification_log first (insert 'sending', 23505 = already claimed = skip), then settles to sent/skipped/failed. Chasers: highest-crossed-level only (>= thresholds, so missed cron days still fire once). Invites wired into bookReview (su_review:{id}:{date}:{reviewer} dedupe; rebooking same date never re-sends, new date re-invites) and recordAbsenceMeeting (today-or-future meetings only; employee via work_email fallback profile email, manager via people.manager_id; per-meeting dedupe). Holiday emails wired into requestHoliday (approvers = branch Managers + Admins) and decideHoliday (requester; note included on decline). AI metering backfilled into suggestAbsencePolicy (tokens). UI: /settings/notifications (toggles, thresholds, SMS numbers for Managers/Admins with config-missing notices), /settings/usage, /founder/usage + tiles. Env needed in Vercel: CRON_SECRET (new, cron fails closed without it), TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM (new, optional until SMS wanted); RESEND_* already live. Test checklist: TEST-CHECKLIST-PHASE6.md (A-G). Typecheck NOT run (sandbox limitation): Vercel build is the compile gate.

ABSENCE MEETING BOOKING (Phil, 2026-07-12, popup-agreed): "Book meeting" and "Record meeting" are now separate. Book meeting (migration 0045: meeting_time, duration_minutes, booked_by on absence_meetings + update policy) collects stage/date/time/duration, creates the meeting row WITHOUT evidence, and sends the employee + line manager a FORMAL LETTER invitation (purpose, conducted-by, right to be accompanied) with a timed .ics; must be today or future. Record meeting logs a held meeting (form -> Evidence) and ATTACHES to the open booking for that person/stage when one exists (no invitations ever on record). Booked meetings COUNT towards the meeting stage (Phil chose this; the max(stage) derivation is unchanged). Cards show "Stage N meeting booked: date at time". Editable letter templates -> Additions. 48 HOUR NOTICE (Phil): bookings must be at least 48 hours ahead, enforced server side (londonToUtc cutoff) and in the picker. ACCEPT/DECLINE (Phil, popup-agreed into Phase 6, migration 0046): the employee letter carries Accept / I cannot attend buttons linking to the PUBLIC page /meeting-response/<token> (in PUBLIC_PATHS; unguessable response_token is the capability, service-client reads by exact token only, POST required so scanners cannot auto-respond, answer-once). Decline requires a reason. Response stored on absence_meetings, booker emailed (kind meeting_response, idempotent), card shows accepted/declined + reason. CONDUCTOR (Phil, migration 0047): the Book meeting box has a required "Who is holding the meeting" dropdown limited to active Managers/Admins (validated server side); the conductor is named in the employee letter, receives the conductor invitation (line manager no longer auto-invited), and gets the accept/decline notification (fallbacks: booker, line manager). CANCEL (Phil, migration 0048 delete policy, open bookings only, Admin/branch Manager): Cancel booking on the card confirms, DELETES the booking (stage drops back), emails "Meeting cancelled" to both invitees (kind meeting_cancelled, idempotent); recorded meetings are immutable; rebook = book again. Card booked line shows "held by X". Book dialog remounts per open (stale success state was insta-closing it). LOCATION (Phil, migration 0049): bookings require a location (address or Teams), shown in letters, .ics LOCATION and the response page. CANCEL/REARRANGE in one popup (Phil): rearrange updates the slot/location/conductor in place, resets the response, keeps the token, sends replacement letters (dedupe keys carry the slot); the conductor letter was rewritten to read unambiguously as chairing (their .ics is titled "Absence meeting with X"); Absence cards widened to 2 per row so the five buttons sit on one line. NOTE: components/absence/cancel-booking-button.tsx superseded by cancel-rearrange-dialog.tsx (Phil deletes the old file locally; sandbox cannot unlink). SECOND TEST PASS AMENDMENTS (Phil, 2026-07-12): (a) Location is a DROPDOWN of the company's NAMED offices + Teams (amended again by Phil): "{Company} Office" (the Team branch) then "{Branch} Branch Office" per branch (lib/absence/data.ts listMeetingOffices); migration 0050 adds branches.address (edited in Settings > Branches with a spec-compliant save button); the chosen office's address prints in FULL in letters + .ics; offices without an address are shown disabled "(no address set)" and server-rejected; Teams stores "Microsoft Teams" and letters say a Teams invite will follow shortly; card booked line shows the location. (b) STAGE GATE: stages already held or booked are not offered and are server-rejected (Stage 4 may repeat); the "no further action" cycle reset ships with meeting outcomes (Additions). (c) Employee-facing emails (invitation, cancellation) carry NO "Open Be Care Compliant" CTA, employees have no accounts; conductor copies keep it (shell CTA now optional). (e) DECLINED IS NOT BOOKED IN (Phil, migration 0053): a declined open booking does not advance the stage (person_absence_summary excludes evidence-less declined rows), is not offered in Record meeting, never receives attached Evidence, and does not block rebooking its stage; it stays visible on the card until rearranged or cancelled; held meetings always count. Form v3 (0052): purpose help caption removed (duplicated the prefill), Meeting Minutes gains a "not required" checkbox; absence list scoped to the booked stage via the company's occasions thresholds. (d) RECORD MEETING rework (Phil's spec): migration 0051 publishes v2 of the absence_management_meeting form (master template + every company copy; evidence keeps its version): Job Title removed, Meeting Type first, new Meeting Minutes section. The dialog personalises per person (absence-view meetingFormFor): Meeting Type options = the person's open booked stages, prefills from the earliest booking (conductor, date, standard purpose) and from their absence data (level, count, dates), via the existing presetAnswers/schema props on FormEvidenceDialog (no renderer changes).

LIVE-TEST AMENDMENTS (Phil, 2026-07-12): (1) migration 0044 adds planned_review_time + planned_review_duration_minutes to service_user_trackers; the booking popover collects date, time (default 10:00) and duration (default 1 hour), the reviewer .ics is a TIMED Europe/London event (londonToUtc helper in lib/email/ics.ts handles GMT/BST), and the dedupe key includes the time so a changed slot re-invites. (2) The Book in popover keeps a visible "Booking…" state until the save completes (Saving-state standing rule). (3) SMS numbers are entered as dialled (07...) and normalised server side to E.164 (standing rule). (4) Save buttons are btn-primary everywhere (standing rule, was regressed on the SMS number rows). Testing progress: A1-A5, B1, B5 PASS; B2-B4 ride on the first live cron (scheduled auto-verify 2026-07-13 08:30 UK); E and F sections in progress.

- ABSENCE MEETING INVITATIONS (Phil, 2026-07-11): send the employee (and manager) a branded invitation with an .ics calendar invite when a Stage 1 to 4 absence-management meeting is due/scheduled, reusing the same email + .ics infrastructure as the Service User reviewer invite below. The meeting questions + outcomes themselves build with the Absence feature (see the Additions "Absence meeting invitations / questions / outcomes" item); only the invitation email lands here.

- CARRIED FROM PHASE 4 (Phil, 2026-07-10): the Service User Planned Review Date booking must email the chosen reviewer a branded Resend email with an .ics calendar invite (add to phone/Outlook). The booking data + Booked In status shipped in Phase 4 (lib/service-users/actions.ts bookReview); this phase adds the email + .ics generation on booking, respecting the "emails no-op if RESEND_API_KEY/RESEND_FROM missing" dependency and the no-plain-text-links / branded-CTA rule. Remember to test the full booking -> invite flow when built.

## Phase 7 — Billing & tiers  ✅ COMPLETE (confirmed by Phil 2026-07-12; core paths tested live, edge cases logged to Final Testing)

Fixed (not up for debate): every subscription tier includes 4 users then £5 per extra user per month, EXACT seat counting (5th user starts billing, removing stops it). Diamond has no subscription, pays usage only (SMS + AI from usage_events). Black is free and founder-granted, never purchasable, no Stripe subscription.

PLANNING POPUP AGREED (Phil, 2026-07-12), load-bearing decisions:
- Architecture: one Stripe Customer per company. Subscription-tier companies get a licensed BASE price per tier PLUS a separate £5/seat licensed price with quantity = max(0, active users − 4). Diamond = no subscription, usage-only via monthly Stripe invoice items generated from usage_monthly. Black = no Stripe objects at all.
- Card capture: Stripe Checkout (subscribe) + Stripe Customer Portal (payment method, invoices, cancel). We NEVER touch card data (PCI SAQ-A). No embedded card forms.
- Proration: Stripe default create_prorations (mid-month seat change prorates onto the next monthly invoice; removals credit).
- Activation: Founder still creates the company and sets the tier; the Company Admin self-serves the card via Checkout on /settings/billing and self-manages in the Portal. Founder keeps full visibility and grants Black/Diamond. Not founder-managed cards.
- Billing page at /settings/billing (extends the existing Seats card). Webhook at /api/webhooks/stripe (already covered by the /api/webhooks PUBLIC_PATHS prefix). GBP only. No free trials.

PRICING POPUP AGREED (Phil, 2026-07-12), researched against UK care software (competitors £100–£350/site/mo or £6–£12/user/mo):
- Base prices (monthly, GBP): Business £49, Pro £99, Enterprise £199. All include 4 users then £5/extra. Diamond usage-only, Black free.
- Tier contents = FEATURES LADDER: all tiers get core compliance (People + Service User registers, checks, forms, RAG, email digest, 1 branch; extra branches a paid add-on on every tier). Pro adds SMS reminders + reporting/inspector exports (Phase 8) + the form builder. Enterprise adds AI (policy parse, future AI form gen) + the integration layer + priority support.
- Billing period: monthly only for now (annual deferred).

BUILD STATE (2026-07-12): all 13 tasks BUILT in the sandbox; migration 0056 applied to ref bgrtcvyjuwopunpnudeu only. NOT deployed (Phil pushes; `npm install` first because `stripe` is a new dependency) and NOT tested (needs Stripe test-mode setup). Details + cold checks logged to Final Testing; run TEST-CHECKLIST-PHASE7.md once deployed and Stripe is configured.

Build order (13 tasks in the Phase Progress box): (1) Stripe scaffolding lib/stripe/{client,config} + env; (2) migration 0056 company_billing + stripe_events dedupe (claim-then-settle like notification_log), RLS + numbered SQL, ref bgrtcvyjuwopunpnudeu ONLY; (3) Stripe products/prices in TEST mode (founder walkthrough); (4) lib/billing/tier.ts gating helpers (features ladder); (5) lib/billing/stripe-sync.ts exact seat-quantity sync on every user add/remove; (6) Checkout + Portal server actions (ActionState, save-button spec); (7) /api/webhooks/stripe (raw-body signature verify, fail-closed in prod, event-id dedupe, updates company_billing + status, audited); (8) /settings/billing page (tier, seat cost, payment method + invoices, subscribe CTA, past_due/canceled states, Black + Diamond variants); (9) Diamond month-end usage cron -> Stripe invoice items (idempotent per company-month); (10) founder billing visibility (tier, status, seats, MRR, Diamond usage, Black flag); (11) single-session polish (clear signed-out-elsewhere UX everywhere); (12) apply tier gating per the ladder; (13) typecheck + trace + TEST-CHECKLIST-PHASE7.md (Stripe TEST mode end to end) + deploy verify, log untested to Final Testing. Stripe test mode end to end before any live key.

## Phase 8 — Reporting, exports & audit trail  ✅ COMPLETE (signed off by Phil 2026-07-14; deployed, admin surface tested live in Chrome, remaining role/tenant/billing/real-file checks logged to Final Testing section I)

PDF + CSV export helpers (shared, routed through one module), inspection-ready evidence packs, register and branch compliance reports, audit trail views. Format a manager can hand to a CQC/CIW inspector.

CLOSE STATE (2026-07-14): deployed to production (Vercel region pinned to lhr1 next to Supabase London for latency). Live admin test pass PASSED (see TEST-CHECKLIST-PHASE8.md section I). Mid-phase additions that shipped inside Phase 8 and are part of this close: the daily reporting emails (2 per company, People + Service Users, on the Phase 6 digest cron); the PQS report (renamed from On time; migration 0059 reporting_interval_days so the report grades against the regulatory deadline while the register keeps the operational interval; single-box layout with starred PQS measures + instant portal tooltip; Social Care Wales % Quality Q3; branch selector + downloads moved into the report view); the on-screen Evidence View page (/evidence/[id], read-only form + Download PDF + signed file/signature links, view audit-logged); History timeline restricted to Admins; the whole Training sub-department (migrations 0060 + 0061, see the bcc-training-dept memory); Service User Outcomes + Satisfaction placeholder sub-departments (build in Additions). See the bcc-cardiff-pqs and bcc-training-dept memories.

BUILD STATE (2026-07-13): FULLY BUILT in the sandbox; migration 0058 (record_audit_trail RPC + audit actor index) applied to ref bgrtcvyjuwopunpnudeu only + saved as the numbered SQL file. NOT deployed (Phil pushes; the Vercel build is the first full compile) and NOT live tested. Decisions agreed by popup 2026-07-13 (see the bcc-phase8-decisions memory): four reports (register, compliance, per record evidence pack, audit trail) in a new /reports area + contextual Export buttons, all through ONE shared module lib/export/* (@react-pdf/renderer PDF helper + one CSV helper, no new dependency); reuse renderEvidencePdf + the 5 minute signed URL; Business tier CAN download a single record's own Evidence PDF (audit logged) else exports are Pro+; LEAN audit model (action, actor, date/time, no old->new diffs, no IP); probation shows all four fields; read audit = every Evidence view/download + Service User open, NOT People opens.

New code: lib/export/{csv.ts, pdf.tsx, format.ts, reports.ts, audit.ts, evidence-pack.tsx, deliver.ts, context.ts}, lib/evidence/on-demand.ts, lib/audit-log/data.ts; app/api/evidence/[id]/pdf/route.ts, app/api/reports/{register,compliance,evidence-pack,audit}/route.ts; app/(app)/reports/{page,audit/page}.tsx, app/(app)/founder/audit/page.tsx; components/reports/{reports-panel,audit-log-view,record-history}.tsx, components/action-form.tsx (shared save button wrapper), components/settings/delete-user-dialog.tsx, components/founder/company-status-button.tsx. Edits: lib/evidence/pdf.tsx (extracted EvidenceEntry so packs reuse it), lib/nav.ts + components/nav-icon.tsx (Reports nav entry + icon), the People + Service User drill downs (History tab + Evidence PDF links + save button sweep), founder + settings actions/pages (save button sweep + audit).

SAVE BUTTON SWEEP done as part of this phase (all logged offenders converted to the shared ActionForm / useActionState pattern with update-count checks): founder setCompanyStatus x3, settings resend/revoke invite + setUserStatus + deleteUser, people/[id] applyMissingChecks/updateTracker x2/transferPerson/assign/unassign/setEmploymentStatus/setArchived, service-users/[id] applyMissingChecks/transfer/assign/unassign/setServiceStatus/archive. Delete user now uses a styled dialog (window.confirm removed). Clears the SAVE BUTTON SWEEP Final Testing item.

Run TEST-CHECKLIST-PHASE8.md as popups once deployed. Cold items logged to Final Testing below.

DAILY REPORTING EMAIL — APPROVED LIVE by Phil 2026-07-14. FINAL agreed behaviour: two emails (a People report and a Service User report) to ADMINS and MANAGERS: ADMINS get them company-wide (all branches), MANAGERS get them scoped to their branches. Supervisors keep their caseload digest; chasers + SMS unchanged. Each section is a THREE COLUMN table (Name, Task, Date), one row per check; overdue rows read "Overdue DD/MM/YYYY", the due section shows the date DD/MM/YYYY; horizon fixed at 14 days; compliance checks only (never holiday or absence). Sends the all clear daily, only for a population the company has. Layout + content approved live 2026-07-14 (admin-only test send verified, correct table + counts); recipients set to admin + managers per Phil's final call. Original design notes below (superseded on layout).

DAILY REPORTING EMAIL (Phil, popup 2026-07-13, pulled into Phase 8). Two separate daily emails per company on the Phase 6 digest infrastructure: a People compliance report and a Service User compliance report, each with a "Records overdue" section and a "Records due in the next 14 days" section, records grouped with their checks and dates. Sent to MANAGERS + ADMINS (admin = whole company, manager = their branches) at 07:00 London, and these REPLACE the generic digest for managers/admins; SUPERVISORS keep the caseload digest; chasers + SMS unchanged. Sends the all clear daily (positive confirmation), but only for a population the company actually has. People report is compliance CHECKS ONLY (never holiday or absence; the check_status views exclude them). 14 day horizon fixed (not the amber threshold). New code: lib/notifications/data.ts getReportingData + ReportingCheck + REPORTING_HORIZON_DAYS; lib/notifications/digest.ts splitReporting/scopeReporting/reportingDedupeKey; lib/email/templates.ts reportingEmailHtml/reportingSubject/ReportingRow; app/api/cron/daily-digest/route.ts restructured (supervisors -> digest, managers/admins -> the 2 reports, kind people_report/service_user_report, per population per day dedupe in notification_log which is unconstrained text so NO migration). Test after deploy by triggering the daily-digest cron with ?force=1 and checking notification_log + a real email.

Evidence PDF is now generated ON DEMAND here, not at save time (changed 2026-07-09 for speed). submitEvidence stores the immutable answers + pinned form-version schema snapshot only (evidence.pdf_path/pdf_sha256/pdf_bytes left null); because the snapshot is frozen and renderEvidencePdf (lib/evidence/pdf.ts, kept) is deterministic, the branded PDF is regenerated identically when downloaded/exported. This phase builds that on-demand render + the 5-minute signed-URL download, audit-logged. (Older evidence rows created before this change still have a stored PDF; new ones don't, so the export path must always be able to render from the snapshot.)

OPEN QUESTION to raise with Phil (popup) at the start of this phase (Phil request, 2026-07-09): how should reports handle probation extension? i.e. how an extended probation (original end due, actual end, extension date, status) is represented in the compliance reports and inspector-facing exports. Ask before building the report format.

## Phase 9 — Founder console  ✅ COMPLETE (signed off by Phil 2026-07-14). Scope agreed by popup: Full console, Full manage-as support session, Full health console, riskiest-last order. All 7 features built + deployed. Live-tested in Chrome across two logins (founder + Company Admin): dashboard, drill-in, cross-company user disable/enable + audit, revenue reconciliation, training edit + deactivation-does-not-seed, health console, manage-as enter/operate/exit, invite resend/revoke, cross-tenant guard, forged-cookie-inert, mobile layout, all PASSED. Bug found + fixed mid-test: migration 0062 (People-check seeding, all-NULL VALUES column typed text). Manage-as polish shipped: "Support session: <company>" greeting + central impersonation audit tag in writeAudit. ONLY item in Final Testing: the 30-minute manage-as auto-expiry actually lapsing (code correct, cannot be fast-forwarded). Single-session non-interference confirmed safe by design. See TEST-CHECKLIST-PHASE9.md.

Cross-company: companies, users, billing and revenue, template library curation, audit logs, platform statistics, error console, manage-as-company mode.

Already in place before Phase 9 (audited 2026-07-14): `/founder` home with company list (tier, status, seats, billing pill, per-company monthly, committed MRR) + activate/suspend/archive; `/founder/forms` (form template library curation); `/founder/question-bank`; `/founder/usage` (SMS + AI per company, Diamond source); `/founder/audit` (cross-company audit viewer, filter + export). All guarded by `requirePlatformAdmin()`. `notification_log` already records `status='failed'` + `error` for email/SMS. Manage-as-company confirmed NOT built (only placeholder text in People/Service User pages).

Phase 9 task split (agreed order, riskiest last). Progress: tasks 1 to 7 BUILT 2026-07-14, ZERO migrations for the whole phase. Tasks 1 to 3 deployed green; tasks 4 to 7 built in one batch (deploy pending). Task 8 (testing) runs as popups once deployed. KEY FINDING: every core tenant table (people, service_users, check_instances, evidence, branches, check_definitions) already grants is_platform_admin() in RLS, so the founder already had full cross-company DB access. Manage-as (task 7) is therefore an application-layer scoping layer, not an RLS change: a signed, httpOnly, 30 minute cookie (lib/founder/manage-as.ts, HMAC over SUPABASE_SERVICE_ROLE_KEY, fail-closed) that the company-scoping guards (requireCompany / requireCompanyAdmin, via applyManageAs) read to return a SHADOW profile (company_id = acting company, role = company_admin) so every existing tenant page/action works unchanged. requireProfile / requirePlatformAdmin stay on the REAL profile (so /founder and Exit still work). Single-session login untouched (no second login). Layout shows the acting company's nav + a persistent amber banner (components/founder/manage-as-banner.tsx) with a one-click Exit; enter from the company drill-in (EnterManageAsButton). enter/exit are audited (founder.manage_as.enter / .exit). KNOWN LIMITATION logged to Final Testing: tenant writes made while impersonating are audited with the founder's email but actor_role reads "company_admin" (the shadow role), not a distinct impersonation tag; the enter/exit audit events bracket the session. dashboard switched from requireProfile to requireCompany so it scopes while impersonating.

1. Founder stats dashboard — companies by tier and status, total active users and seats, committed MRR and revenue, SMS + AI usage this month, sign-ups over time. Keep the company list + create-company below it.
2. Per-company drill-in — `/founder/companies/[id]`: tier, status, seats + cost, billing state, usage (month + by month), recent activity, users. Platform-admin-guarded cross-company read.
3. Cross-company user management — users per company, status/role, disable/re-enable, resend/revoke invites, seat impact. Reuse invites.ts + existing user actions; all writes audited; single-session preserved.
4. Billing and revenue oversight — total MRR, per-company billing state (past_due/canceled surfaced), Diamond usage-to-invoice, Black (free) flagged. Read-only; reuse seats.ts + stripe config + company_billing + usage_monthly.
5. Training course template curation — founder screen for `training_course_templates` (seeded by `seed_company_training_courses`), matching the forms/question-bank curation pattern; mandatory/safeguarding flags.
6. Error and health console — failed email/SMS (notification_log), Stripe webhook + cron outcomes, missing-env dependency flags. Decide by popup if a new health/log table is needed.
7. Manage-as-company support mode (built LAST) — full support session: enter any tenant as their Company Admin, persistent banner, clean exit, every action audit-logged as founder impersonation; must not break single-session login. Design entry/exit (server-side) by popup before building.
8. Phase 9 testing and sign-off — TEST-CHECKLIST-PHASE9.md run as popups; untested items logged to Final Testing; Phil confirms complete.

## Phase 10 — Additions

Ideas that arrive mid-phase get parked here (popup decides: current phase or Additions).

**ROUND 1 — ACTIVE (agreed with Phil by popup 2026-07-14, "Unblocker + flagship").** Build order: (3) Import founder templates into an existing company, then (1) Complaints section, then (4) Custom check types as register columns, then (8) Edit an existing user's branch assignment. Rationale: opens with the small high-leverage unblocker (existing companies cannot yet receive new master templates, which also holds up Holiday/Absence and the F1-F4 email tests), delivers the confirmed Complaints flagship, then clears two papercuts found in earlier live testing. Each item: design-confirm popup, then build, then popup test checklist (untested logged to Final Testing). The Phase Progress box mirrors this round's tasks. Migrations start at 0063 (ref bgrtcvyjuwopunpnudeu only + numbered SQL files). The remaining backlog items (2, 5, 6, 7, 9) stay parked below for a later round.

ITEM 1 (Complaints) design agreed by popup 2026-07-14: access = Company Admins (all branches) + branch Managers (their branch) + Founder, NO Supervisor/Team Member (mirrors Service User isolation, special-category); linkage = complainant (name + relationship service_user/relative/staff/professional/public/anonymous) + OPTIONAL service_user_id link; lifecycle = Open/In Progress/Closed PLUS response-deadline RAG (per-complaint due date, not the recurring check engine). Cited response defaults (editable per company via complaints_config): acknowledge 3 working days, respond 25 working days (England CQC Reg 16 / LGSCO benchmarks; Wales Social Services Complaints Procedure (Wales) Regs 2014, Stage 1 10wd / Stage 2 25wd). MIGRATION 0063 APPLIED to ref bgrtcvyjuwopunpnudeu + numbered SQL file: population + evidence.record_type vocabularies extended to complaints/complaint; the 3 complaint forms repointed service_users -> complaints (master + company copies); complaints_config (Admin timescales); complaints table (ref_number per-company trigger, subject/details, complainant, optional SU link, status, lifecycle dates, response_due, outcome, audit cols); RLS = is_platform_admin/is_company_admin/is_branch_manager on complaints, is_company_member read + admin write on config; advisors clean (no missing-RLS). Evidence isolation needs NO change: evidence_select already keys on is_branch_manager (not is_branch_member), so complaint Evidence is Manager+Admin+Founder+author only. APP LAYER BUILT 2026-07-14 (migration 0064 applied: complaints REPLICA IDENTITY FULL + supabase_realtime membership for the live register). New: lib/complaints/{types,logic (responseRag + working-day deadline maths, reuses recurrence + people/logic),data (server-only, reuses getCompanyFormByKey + listAccessibleBranchTypes),actions (create/update/setStatus/submitEvidence record_type='complaint'/updateConfig)}; components/complaints/{complaints-register (client filter status+branch, RAG pills),create-complaint-form,complaint-forms (reuses FormEvidenceDialog),complaint-status-control}; app/(app)/complaints/{page,new/page,[id]/page (read-audit complaint.viewed, case detail, status control, forms as Evidence, evidence history, edit)}; app/(app)/settings/complaints/page (timescales via ActionForm). Nav: added "complaints" top-level Departments entry + icon (lib/nav + nav-icon), roles admin/manager (+platform via manage-as). Dashboard: Complaints strip (open+in-progress / overdue / closed) + tile, Managers/Admins only. submitEvidence recordType widened to include 'complaint'. VERIFIED (SQL): evidence_select + evidence_files_select both key on is_branch_manager, so complaint Evidence + files are Manager/Admin/Founder/author only (Team Members excluded); is_branch_member grants Admins so they can attach Evidence. Untyped supabase client, so .from('complaints') compiles. NOT deployed/typechecked (sandbox cannot build; Vercel is the compile gate). DEPENDENCY: complaint forms exist in a company only after the item-3 template import (or in new companies); import into Thistle before testing the forms. LOGGED TO FINAL TESTING: complaint overdue chaser email (rides Phase 6, cannot sandbox-test); complaint History timeline (record_audit_trail RPC has no complaint case yet); confirm the 3 complaint forms surface acceptably in the form builder list (population 'complaints').

ITEM 3 (import templates) BUILT 2026-07-14, no migration. Scope agreed by popup (Claude's recommendation, Phil delegated): categories = form templates + training courses (baseline check definitions left out, code-seeded, add later if needed); selection = import all missing (idempotent, reuses existing guarded RPCs); who = both founder and Admin. Reuses seed_company_form_templates + seed_company_training_courses (SECURITY DEFINER, guarded platform_admin OR company_admin). New: lib/templates/import.ts (importCompanyTemplates + importSummary, plain helper), founderImportTemplates action + components/founder/import-templates-button.tsx on the /founder/companies/[id] drill-in (new Templates section), app/(app)/settings/templates/{page,actions}.tsx (Admin self-serve importOwnCompanyTemplates) + components/settings/import-templates-panel.tsx + a Settings tile. Audited as company.templates_imported. Pre-deploy check: Thistle has 17 forms, missing 21 of 38 active masters (HA four already present, so idempotency exercised on real data). NOT deployed/live-tested yet (sandbox cannot build; Phil pushes). Live test logged in the Phase Progress box.

- Editable formal letter templates (Phil, 2026-07-12, popup during Phase 6 testing). The absence meeting invitation email is written as a fixed formal letter (purpose, stage, conducted-by, right to be accompanied, confirm attendance) in bookAbsenceMeeting. This item adds per-company editable letter templates: a Settings screen where an Admin edits the wording with placeholders (employee name, stage, date/time, manager, company), versioned like forms, used by the booking email and any future formal letters (probation, disciplinary). Confirm placeholder set and which letters are templatable by popup when built.

- Public (no-account) forms for Team Members (Phil, 2026-07-11). Team Members will NOT have app accounts. Instead, forms (starting with Holiday, and applicable to absence/other TM-facing forms) are exposed as PUBLIC web pages linked from the company's own website "team area". A staff member clicks the link, fills the form, submits, with no login. This is a standing-decision shift: TMs stop being invite-only app users (Phase 1 model) and become public-form submitters (it is NOT public self-signup, no account is created; it only writes a submission). Build needs: (1) a public form page per company + per form (e.g. /f/<company-slug>/<form-key>) that ONLY writes, never reads other data; (2) a secure public submit endpoint, rate-limited + honeypot (no CAPTCHA available), signature/slug-scoped, fail-safe, added to middleware PUBLIC_PATHS, never exposing the service-role client; (3) MATCHING to a Person BY EMAIL (confirmed) against people.work_email, and if no match, hold the submission in an "unmatched queue" for a Manager/Admin to link to the right Person rather than guessing or dropping it; (4) the submission then creates the same Evidence + holiday_request/absence_event rows as the in-app flow. GDPR: public intake of personal data, so validate + rate-limit hard, and audit. Revisit the Holidays & Absence TM-self-request-via-app path once this exists (it may be replaced by the public form). Confirm the exact form set, the URL scheme, and the unmatched-queue UI by popup when built.
  - **BUILT 2026-07-26 (migrations 0126 + 0127 applied to bgrtcvyjuwopunpnudeu + numbered SQL files).** Design confirmed by popup: form set = HOLIDAY REQUEST only for v1 (absence notification, report a concern and training request stay parked); URL scheme = **`/f/<code>`, a six character short link** (revised same day: Phil looked at `/f/acme/holiday_requests` and said "thats not a shortlink is it", so migration 0128 adds `public_form_links.code`, generated app side from an unambiguous alphabet with no 0/O/1/l/I, one segment, regenerable from Settings which instantly kills every copy of the old link, and the company name is no longer in the public URL. A shorter DOMAIN, e.g. bccl.uk, was offered and can be added later without changing any of this); identity = PERSONAL EMAIL only, matched against people.work_email (the "Personal email" field on Add a person), no surname and no access code; queue = **People > Submissions** plus a dashboard card. Phil's steer on delivery: a company CREATES A SHORT LINK IT CAN PUBLISH (Settings > Public forms), no logins anywhere.
    - DB (0126): `public_form_links` (company + form_key + enabled, the row existing and enabled IS the capability), `public_form_submissions` (matched / unmatched / linked / discarded, holds the raw answers until linked), `public_form_hits` (rate limiting, stores a salted HASH only, never an IP). RPCs, all SECURITY DEFINER with pinned search_path: `submit_public_form` (service_role only, re-checks the link, matches by lower(work_email), an AMBIGUOUS match counts as no match), `public_form_materialise` (shared internals: writes the immutable Evidence with author_id NULL and the submitter's email/name, plus the pending holiday_requests row), `public_form_rate_ok` (service_role only), `link_public_submission` + `discard_public_submission` (authenticated, company-wide or branch-manager checked). Verified by SQL: anon has EXECUTE on none of the public-path functions. RLS: links readable by company members, writable by Admin; submissions readable by company-wide roles and Branch Managers (an unmatched one has no branch, so any Manager in the company can clear it); hits has RLS on with NO policies (service role only). Index on people (company_id, lower(work_email)). 0127 adds REPLICA IDENTITY FULL + supabase_realtime membership so the queue updates live.
    - APP: public page `app/f/[code]/page.tsx` (write only, no reads, reuses the shared FormRenderer, identity boxes for full name + personal email seeded into blank free-text name/email questions as PRESETS so the stored schema is never rewritten, hidden honeypot, "/f" added to PUBLIC_PATHS); `lib/public-forms/{config,types,data,actions,submit}.ts` (config is the publishable catalogue, so a manager-only form can never be exposed); `components/public-forms/{public-form,copy-link}.tsx`; Settings > Public forms (create link, copy link, switch off, all through ActionForm); People > Submissions queue with Link to Person + Discard; nav child + Settings tile + dashboard "Submissions to link" card. DUPLICATE QUESTIONS DROPPED (Phil, same day): the public page already asks for full name and personal email, so `lib/public-forms/render.ts` (publicRenderSchema) removes any non-required email question from the RENDER, e.g. the Holiday form's "Please enter your email address." at the bottom. Render-side only, the stored version is untouched, server validation still runs against the form on file, and the submit path seeds the identity email back into the dropped question so the Evidence is still complete. A REQUIRED question is never dropped. Rate limit 5 per 10 minutes per caller per form. The public page returns the SAME thank you whether or not the email matched, so it cannot be used to test who works for a company.
    - EMAIL LOOP CLOSED: a matched submission fires the existing notifyHolidayRequested to the approvers immediately; an unmatched one waits in the queue and only notifies when a Manager links it. notifyHolidayDecided now takes fallbackEmail/fallbackName, so a public submitter (who has no profile) still gets the approve/decline email, with no CTA button since they have nowhere to log in.
    - NOT live-tested yet (Vercel is the compile gate). See Final Testing.

- AI Return to Work (Phil, 2026-07-11). AI-assisted Return to Work process for the Absence feature: when a staff member returns from an absence, generate/assist a Return to Work interview (e.g. AI drafts the interview questions and a summary from the absence record, or completes a RTW form) tied to the absence_events record, stored as immutable Evidence like the other absence forms. Uses the Anthropic integration and per-company AI usage metering (same as the absence policy parse). STANDING RULE (Phil, 2026-07-11): a Return to Work interview happens after EVERY absence, at EVERY stage/level, not just the first one or two, so the RTW flow must fire on every occasion regardless of stage (also now baked into the absence-policy AI prompt so the summary reflects it). Exact scope, the RTW form/template, and where it surfaces (Absence view card action + Person drill-down) to be confirmed by popup when built. Sits alongside the Holidays & Absence feature.

- Absence meeting invitations / questions / outcomes (Phil, 2026-07-11). Extend the absence-management meeting flow (absence_meetings, Stage 1 to 4): (1) INVITATIONS — when a meeting is due/scheduled, send the employee (and manager) a branded invitation with an .ics calendar invite. This rides on the email + .ics infrastructure, so it is a Phase 6 (Notifications) deliverable (see the Phase 6 carried item), reusing the same pattern as the Service User review reviewer invite; (2) QUESTIONS — a structured, ideally stage-specific set of meeting questions (extend/complement the Absence Management Meeting form), so each stage has the right prompts; (3) OUTCOMES — capture the meeting outcome (agreed actions, warning level, next stage, review date) against the absence_meetings record, stored as immutable Evidence, and surfaced on the Absence card + Person drill-down. Questions + outcomes can build with the absence feature; invitations land in Phase 6. Confirm the question sets, outcome fields and who gets invited by popup when built.

- Complaints section (Phil, popup 2026-07-11). Add a THIRD top-level section alongside People and Service Users, called "Complaints". Vocabulary (confirmed): section "Complaints", one record = a "Complaint", collection view = the "Complaints register". Data model (confirmed = CASE with a status lifecycle, NOT the recurring Check/RAG model): each complaint is a record with an Open / In Progress / Closed lifecycle plus the relevant dates (raised, occurred, acknowledged, investigation completed, outcome). No recurring checks, no recurrence engine, no due-date RAG rollup, because a complaint is a one-off case not a recurring compliance requirement. The three complaint forms already in the founder library (complaints_concerns, cardiff_complaint_response, newport_complaint_response) become the Complaints section's forms and attach as Evidence against a complaint record; on build, repoint their population from the interim 'service_users' to the new 'complaints' value. Scope of work: new population value 'complaints' (migration: enum/table, complaints record table with company_id + branch_id + status + dates + free-text, RLS with is_company_member/is_company_admin patterns and role isolation, audit logging), navigation entry + register list (status pills Open/In Progress/Closed, filter by status/branch, empty state), record drill-down (case detail + attached complaint-form Evidence + status transitions), and a dashboard surface (e.g. open vs closed counts). Reuse where possible: the register list shell, pill-select, back-link, forms engine + immutable Evidence, branded PDF export. Decide at build time whether a lightweight optional due-date on acknowledge/respond should surface RAG (Phil picked pure lifecycle for now; a hybrid was offered and not taken, revisit if he wants overdue-response alerts). GDPR: complaints can contain special-category data about service users, so treat access with the same isolation + read-audit rigour as Service Users.

- Import founder templates into an EXISTING company (Phil gap, 2026-07-11). seed_company_form_templates only runs at company CREATION; there is no UI to pull newly added / updated master templates (e.g. the 25 Monday forms) into a company that already exists. Build a founder/admin action to copy selected active master templates into an existing tenant (idempotent, skip keys already present), so the Monday library and any future masters reach live companies.

- Custom check types as register columns (Phil, popup 2026-07-10). A check type created via Settings > People/Service Users > New check type (Phase 5) lands in the data, the record drill-down and the RAG rollups, but does NOT get its own column in the dense register matrix, which renders a fixed curated column set (REGISTER_COLUMNS / SU_REGISTER_COLUMNS mirroring Phil's Monday board). Extend the People and Service User register matrices to render custom check definitions as extra columns at the right (with next due + last completed cells + Complete route), so custom checks are visible at a glance, not only in the drill-down. Found during the Phase 5 live test run.
  - BUILT 2026-07-16 (migration 0074, Columns panel show/hide + drag order, ExtraCheckCell) then PARKED + HIDDEN behind `const CUSTOM_COLUMNS_ENABLED = false` in people-register.tsx + service-user-register.tsx (Phil paused it). To un-park, first add the OUTSTANDING piece Phil asked for: at check-build time the Admin chooses WHAT the column displays, a DATE field or a SELECTION field from the form (never a free-text box); and the cell shows just that (the "Done <date>" subtext was already dropped). Store the chosen field on check_definitions and read its latest evidence answer into the cell. Revisit the green Saved flash on the panel Save button too.

- Edit an existing user's branch assignment (reassign or add branches) from the Users screen. Phase 1 sets a user's branch at invite time only; changing it later is not yet built.
- Live-updating Users/invites list: DONE 2026-07-12 (pulled into Phase 7 by popup during billing testing). Migration 0057 adds invites + profiles to the supabase_realtime publication (REPLICA IDENTITY FULL was already set); the existing RealtimeRefresh helper is mounted on /settings/users with tables=[invites, profiles], channel "users-live". The pending and team lists now update the instant an invite is accepted or a user is changed/disabled/deleted, RLS scoping events, with the 10s poll fallback. (Phil request, parked 2026-07-08.)
- Company dashboard stat cards redesign (Phil, 2026-07-17) BUILT. People + Service Users: Overdue / Due in 14 days / Due in 30 days (dropped Compliant), counting each active record ONCE by its most urgent check's due date, NESTED (due30 includes due14), fixed windows independent of the amber setting; visible to ALL dashboard roles (incl Supervisor, RLS-scoped). Complaints: Open (open+in_progress) / Overdue / Avg days to close (ALL-TIME closed, raised->closed); stays Managers-and-above (Admin/Registered/Branch Manager, NOT Supervisor/Viewer). Holidays: Pending requests count; Managers-and-above. Absence: two LIST cards, Meetings to book (meetingDue and no scheduled meeting) + Meetings in next 7 days (booked, unrecorded, meeting_date within 7d), each shows up to 5 name+stage with "+N more"; Managers-and-above. Every card links through (People->/people, SU->/service-users, Complaints->/complaints, Holidays->/people/holiday, Absence->/people/absence). New lib/dashboard/data.ts (getComplianceBuckets via *_check_status intersected with *_rollup active set, getHolidayPendingCount, getAbsenceMeetingSummary reusing lib/absence/data); getComplaintCounts extended with avgDaysToClose; app/(app)/dashboard/page.tsx rewritten. NOT yet live-tested (Vercel compile gate); verify in Chrome + log cold checks.
- Sync Supervision form edits to the founder template (Phil, 2026-07-19). DONE 2026-07-19: the founder-curated Supervision master template (form_templates key='supervision') was updated by SQL to relabel "Supervisor name" -> "Completed by" and drop the "I confirm this supervision was conducted confidentially" checkbox, so NEW companies now seed the corrected form. Thistle already carried the same v2 (form_versions v2); no other existing companies remained (ZZ Seed Test deleted same day), so no per-company back-apply was needed. The Annual Appraisal form is Thistle-specific (AI-built), so no template sync applies to it.
- Accept-account form: add email for password-manager autosave (Phil, 2026-07-19). On the welcome/accept-invite form (app/welcome/welcome-form.tsx + page.tsx) the user sets their password, but the form only has a pre-filled "name" field then password + confirm, with NO email field. Password managers save a (username, password) pair, so with no email present the browser has nothing to attach the new password to (it may grab the name as the username). Fix: pass the invited user's email into the form (page.tsx already has it via `user.email` from requireUser) and render a READ-ONLY email input (type=email, value=user.email, autoComplete="username", readOnly) above the password fields; set the name field autoComplete="name" so it is not mistaken for the login id. Result: on "Set password and continue", the browser offers to save email + password correctly. Small, self-contained, no migration. DONE 2026-07-19: read-only email field (autoComplete="username") added above the name field on welcome-form.tsx; name field set autoComplete="name"; page.tsx passes user.email.
- Public marketing site + self-serve trial capture (Phil, 2026-07-19). BUILT v1: public homepage (app/page.tsx now renders marketing, no longer redirects), /pricing, /start-trial. Direction (popup): homepage + pricing first, "Start free trial" CAPTURES A LEAD and notifies the founder (still founder-led provisioning, NOT auto-provisioning a tenant). Pricing from the Phase 7 ladder (Business £49 / Pro £99 / Enterprise £199, 4 users incl + £5/extra) via lib/marketing/tiers.ts + components/marketing/pricing-tiers.tsx. Lead capture: migration 0086 trial_requests (RLS platform-admin read, service-role insert only, no anon policy) + lib/marketing/actions.ts submitTrialRequest (service client insert, honeypot, founder notify + applicant ack via noticeEmailHtml/sendEmail). Public routing: PUBLIC_PATHS += "/", "/pricing", "/start-trial". Components under components/marketing/. STILL TO DO (later, separate builds): full self-serve auto-provisioning + 14-day trial billing/expiry/conversion (the security-sensitive piece we deferred); a founder screen to view/manage trial_requests (currently email + DB only); marketing/design polish pass (design:ux-copy + design:design-critique). Deploy is code-only (migration already applied via MCP).
- PRICING (Phil, 2026-07-19, on the marketing site): TWO public tiers only, Enterprise dropped. Business £49/mo, Pro £69/mo, both plus VAT. Business = core (People + SU registers, checks/RAG, holiday + absence, training records, company dashboard, role based access, bulk import, forms as evidence, email reminders + digest, basic reporting = the compliance register, AI 25 credits/mo, 1 branch + 4 users). Pro = everything in Business PLUS complaints management, all reports (PQS + evidence packs + audit trail + training), SMS reminders, form builder, priority support, AI 50 credits/mo, 2 branches + 6 users. Add ons: extra users £5/mo, extra branches £7.50/mo, AI top ups 100 credits for £10 (+VAT), credits CARRY OVER until used. Marketing site updated (lib/marketing/tiers.ts, 2-col pricing). BACKEND STAGE 1 DONE (2026-07-19, migration 0087): AI CREDIT ENGINE built. company_ai_credits (balance, last_grant_month) + ai_credit_ledger; spend_ai_credit (atomic -1, blocks at 0, is_company_member guard), grant_ai_credits + grant_monthly_ai_credits (service_role only, revoked from authenticated), tier_monthly_ai_credits (business 25 / pro 50 / enterprise+diamond 50 / black 1000). lib/billing/ai-credits.ts (getAiCreditBalance/spendAiCredit/refundAiCredit/OUT_OF_CREDITS). The 3 AI actions (complaint initial response, complaint response, absence policy parse) now SPEND a credit before the call and REFUND on failure, and the old Enterprise ai_features gate on them is removed (AI is now credit-based on every tier). Monthly grant runs in the daily-digest cron (before the send-hour gate, idempotent per month). Balance shown on Settings > Billing. Current month seeded for all companies. STAGE 2 TO BUILD: Stripe 100-credit top-up (£10 +VAT) product + checkout + webhook grant (needs Phil to create the Stripe product; walk him through it). STAGE 3 DONE (2026-07-19): 2-tier feature gating enforced. (a) COMPLAINTS = Pro: added `complaints` to tier.ts PRO_FEATURES; hidden from nav (layout filters when !featureEnabled), all 4 complaint pages redirect, createComplaint requireFeature-gated, dashboard strip hidden. (b) REPORTING SPLIT: the People + Service User compliance registers are the BASIC report on every tier (register route gate removed; view page allows people/service_users for all); every other report (compliance summary, PQS, training, audit, evidence-pack) is Pro (view redirects Business, ReportsPanel shows "Upgrade to Pro" locks). (c) USER INCLUSIONS: includedSeatsForTier (business 4, pro 6, enterprise/diamond 6, black 9999) wired through computeSeatUsage/getSeatUsage/extraSeats/syncSeatQuantity/startCheckout + Billing display (customer-facing seat billing is correct). SMS + form builder were already Pro. AI is credit-based on all tiers (not gated). (d) BRANCH INCLUSIONS: includedBranchesForTier (business 1, pro 2) + getBranchUsage + a Branches card on Billing showing extra branches x £7.50/mo. NOTE: branches are FOUNDER-provisioned, so there is NO automatic Stripe branch line-item billing (the card informs; auto-charging is an optional follow-on mirroring seats, needs a Stripe branch price). Founder console/companies/revenue seat counts now pass includedSeatsForTier(tier) so they match the customer Billing page (fixed 2026-07-20 after the founder pages showed Enterprise as "3/4" instead of "3/6"). TESTED live in Chrome 2026-07-20 managing-as Thistle (Enterprise): Billing shows Seats 3/6, Branches 3/2 (1 extra £7.50/mo), AI credits 50/mo + top-up copy, Complaints + all 6 reports visible. Business-tier LOCKED states (register-only reports, Complaints hidden, 4 seats/1 branch) not yet seen live: needs a Business company, logged to Final Testing.
- Optional company email-domain allowlist (Phil, 2026-07-17). An OPT-IN, per-company list of allowed email domains, OFF by default. When a company has no domains set (the default), invites behave exactly as now (any email, e.g. gmail/outlook/icloud, so small care providers are unaffected). When an Admin adds one or more domains (e.g. sunrisecare.co.uk), the invite + accept flow rejects any email not matching a listed domain. Purpose = an invite-time guardrail + IG/DSPT-friendly control for larger groups, NOT a tenant-isolation layer: isolation is already guaranteed by invite-only + one-profile-per-company (profiles.company_id) + RLS, so a user cannot reach another company regardless (this idea does not change that). Scope when built: migration for company_email_domains (or a jsonb on companies), Admin UI under Settings > Users to manage the list (validate domain format, no leading @), enforce in the invite server action (settings/actions.ts INVITE path) AND at accept (lib/invites accept) so a stale invite can't bypass it, clear error copy ("Invites for this company must use an email ending in @domain"), and Founder/manage-as exempt. Confirm by popup: case-insensitivity + subdomains, whether to also block CHANGING an existing user's email later, and whether founder-created first-Admin invites are exempt. Deferred build; logged as Additions.
- Setup / Transfer (ACTIVE 2026-07-17, agreed by popups): bulk CSV import for company takeovers. Decisions: CSV upload with per-company generated template; completed-date columns only (due dates calculated); up to 8 dated history columns per recurring check (2yr history for supervision/reviews); include ALL register-matrix columns incl tracker docs (DBS, Enhanced DBS, Right to Work expiry+limits, probation); migrated dates = check_instance last_completed_on set with NO evidence (reads "migrated, no form on file") + a migrated_completions history table for the multi-date trail; Founder + Company Admin. BUILT (not yet live-tested; Vercel compile gate). Column decisions refined: "Email" not "Work email"; multi-date history ONLY for supervision + care_plan_review (HISTORY_KEYS), all other checks single most-recent column; dedupe = skip existing (people by Email then name+branch, service_users by name+branch). Files: lib/import/columns.ts (shared ColumnPlan used by BOTH template + parser), template.ts, parse.ts (CSV parser + validate: branch resolve, DD/MM/YYYY or ISO dates, dedupe, per-row errors), commit.ts (commitPeople/commitServiceUsers: insert record + apply_*_checks + tracker docs + seed_migrated_completion per date, newest advances the check via nextDueAfterCompletion), actions.ts (validateImportAction + commitImportAction, requireCompanyAdmin, audit records.imported), components/settings/import-uploader.tsx (population toggle, file read client-side, preview table + counts, Import button), migration 0082 (migrated_completions + seed_migrated_completion RPC). Placement: Settings > Import records (founder via manage-as). KNOWN SIMPLIFICATIONS: complex-branch care-plan-review initial cadence uses def interval not company complex interval; rtw_limits/probation_status only accept the exact enum keys. TESTED LIVE into Caerphilly 2026-07-17 (5 created, Harry Roberts Newport1 dedup-skipped, next-due maths + RAG + multi-date history + tracker docs all verified in SQL). NEEDS-ATTENTION SUMMARY + EMAIL added (Phil, 2026-07-17): after import, commit returns flags {skipped dups, errored rows, review = recurring checks that recorded a date but got no next due e.g. appraisal off supervision cycle}; shown in an amber panel in import-uploader + branded summary email to Company Admins via importSummaryEmail (noticeEmailHtml) when flagCount>0 (emailNote surfaces sent/not-configured). This REPLACES the appraisal-anniversary concern (admin is told to set the date rather than auto-computing). CAERPHILLY test branch + 5 test people still live (Aled/Bethan/Carys/Dylan/Eleri) unless cleaned. See tasks.
- Setup / Transfer (original note): onboarding flow for a company coming on board, to enter all existing compliance dates (last completed and/or next due for each check, People and Service Users) directly, WITHOUT completing every form. Bulk backfill of check_instances/tracker dates so a new tenant starts with an accurate RAG picture from day one. Must respect the recurrence engine (set next due from the entered last-completed date) and the immutable-Evidence model (dates set without generating fake Evidence, or with a clearly flagged "migrated, no form" marker). Likely CSV import plus a grid entry screen. (Phil request, parked 2026-07-09.)

- HOLIDAY RESPONSE FORM DELETED (Phil, 2026-07-26, migration 0129). Approving or declining a holiday is a DECISION, not a form. The Holiday Response form (inherited from the Monday board) made a Manager complete a form to click yes or no; it is now deleted from every company AND from the founder template library, so no new company receives it. Verified: 0 rows left in forms and form_templates, and it held no Evidence (a copy holding Evidence would have been archived instead, since evidence.form_id is ON DELETE RESTRICT). The Holiday screen now shows **Approve** (one click) and **Decline** (reveals a required reason), both through the shared ActionForm; decideHoliday no longer submits Evidence and calls decide_holiday_request with a null evidence id, keeping outcome, decider, timestamp and reason on the holiday_requests row. The requester is still emailed either way, including public form submitters via the fallback address. STANDING RULE: do not reintroduce a form for the yes or no.

- HOLIDAY CANCEL, WITHDRAW, AMEND, CLASH WARNING, HISTORY (Phil, 2026-07-26, migration 0130). Answered by popup: full cancel plus date editing; clash warning at approval, never a block; leave year and bank holidays PARKED with entitlement; entitlement and balances themselves PARKED by Phil ("will come with features that are to be added later"). Built: `cancelled` status plus cancelled_at / cancelled_by / cancel_reason; `can_manage_holiday_request` (one authorisation place shared by decide, cancel and amend); `cancel_holiday_request` (Manager cancels pending or approved with a reason; the in-app submitter withdraws their OWN while pending only, because once approved the rota depends on it); `amend_holiday_request` (Manager corrects the dates, end cannot precede start). UI: Approve, Decline, Edit dates, Cancel or Withdraw on each pending request; a new "Booked, still to come" list so an APPROVED holiday can be moved or cancelled; a collapsible "Declined and cancelled" history showing the reason. Clash detection is worked out IN THE PAGE from the requests it already holds (no round trip per request, and RLS scoping comes free), and shows "2 others are off in this branch over these dates" with names. notifyHolidayChanged emails the person on a cancellation or a date change, including public form submitters via the fallback address, with no CTA when they have no account; a self-withdrawal sends no email. NOT live-tested.

- PUBLIC FORMS HIDDEN, TEAM MEMBERS GET LOGINS INSTEAD (Phil, 2026-07-26). Phil reversed the no-account decision: Team Members WILL have logins. Public forms are therefore hidden behind `PUBLIC_FORMS_ENABLED = false` in lib/public-forms/flag.ts, NOT deleted: tables, RPCs, queue and page all stay, so flipping the flag restores the feature with no migration. While false: the Settings tile and page, the People > Submissions nav child and page, and the dashboard card are all hidden, /f/<code> reads as not available, and the public submit path refuses, so no unattended write path is left open on an unused feature. Phil's three rulings on the staff login: (1) staff logins must NOT count as billable seats (today company_active_user_count counts every active profile, so a 60 carer agency would be 54 extra seats at £5 = £270/month; a free staff seat class is required); (2) a staff login sees ONLY the forms and policies assigned to them, the forms they have previously submitted, and their current holiday bookings to amend or cancel, nothing else, so it cannot be the current Viewer role which reads every Person and Service User; (3) public forms hidden for now. STILL TO DESIGN AND BUILD: the staff role plus RLS, the free seat class, an assignment mechanism for forms and policies (does not exist yet), and the staff self-service area.

- TEAM MEMBER LOGINS, INCREMENT 1 (Phil, 2026-07-26, migrations 0131 + 0132). Design confirmed by popup: role shown as **"Team Member"**, keyed `staff` (option A: renaming the old team_member key would mean rewriting five live RLS policies including people_select, not worth it for a label); policies = **upload a document, assign it, staff read and acknowledge, the tick stored as Evidence**; assignment = **per person and bulk from the register**; provisioning = Phil's own answer, **"they get an invite when thier email is entered on add a person or when the bulk upload is completed"**, so it is automatic, never a chore.
  - DB (0131): `staff` added to profiles_role_check and invites_role_check; `is_staff()` helper; invites_insert widened so a Company Admin can invite staff AND a **Branch Manager can create staff invites for their own branch** (they add people, so they must be able to); `company_active_user_count` now EXCLUDES role='staff', which makes staff logins **free seats** (without this a 60 carer agency reads as 54 extra seats at £5 = £270/month on top of £69, and the pricing model breaks); `evidence_select` rewritten so staff keep their own submissions via author_id but do NOT gain their whole record, because absence meeting minutes and probation reviews live there. 0132 lets the requester amend their OWN holiday while it is still pending, matching the withdraw rule.
  - APP: `lib/staff/invite.ts` (inviteStaffForPerson: reuses createAndSendInvite with role staff, treats an existing pending invite as success, then links people.profile_id via the service client, which is what makes the existing RLS show them their holidays); `lib/staff/data.ts` (their record, their holidays, their submissions by author_id); `components/staff/my-holidays.tsx` (request holiday, change dates or withdraw while pending, and a plain line saying approved holiday is fixed); `app/(app)/my/page.tsx` (the only page a staff login has); nav gives role 'staff' a single "My area" entry; ROLE_LABELS staff = "Team Member" with a comment explaining the deliberate two-names-alike; createPerson auto-invites when an email is present, audited in metadata and never blocking the record; the bulk import invites every imported person with an email, reporting "invited N to their own login" and listing any that failed. Staff are redirected to /my from the dashboard, People and Service Users.
  - VERIFIED BY SQL: forms_select and form_versions_select are is_company_member, so a staff login can render the Holiday form; is_branch_member is satisfied by the user_branches row the invite creates, so submit_evidence accepts their submission; evidence_select confirmed rewritten with the NOT is_staff() clause.
  - STILL TO BUILD (increment 2): the ASSIGNMENT mechanism itself (company policies as uploaded documents, an assignments table, assign from a Person record and in bulk from the register, read-and-acknowledge stored as Evidence) and the "Assigned to me" list, which currently shows an honest empty state. Also not built: login status and a manual Invite button on the Person record, and staff redirects on the remaining top-level pages (RLS already returns them nothing there, so it is UX not exposure).

- TEAM MEMBER LOGINS, INCREMENT 2: ASSIGNMENTS AND POLICIES (2026-07-26, migration 0133). The half that makes a staff login worth having.
  - DB: `company_policies` (the uploaded document, private evidence bucket under a policies/ prefix, signed 5 minute URLs only, every open audited) and `assignments` (person + form OR policy, optional due date, status assigned/completed/cancelled, evidence_id when done). A PARTIAL unique index stops the same thing being assigned twice while it is still open; ON CONFLICT cannot infer a partial index, so assignItems filters duplicates in the app and the index is the backstop. `complete_assignment` (SECURITY DEFINER) lets the assigned person close their own, or a Manager close it for them. RLS: staff see a policy ONLY when it is assigned to them, and their own assignments only; Managers see their branch, company-wide roles see all; writes are Manager and above.
  - THE ACKNOWLEDGEMENT IS EVIDENCE: migration 0133 seeds a `policy_acknowledgement` master template AND a published copy for every existing company. Ticking "I have read and understood" submits that form through the normal submitEvidence pipeline, so who read which version and when is immutable, exportable and inspection ready. No parallel table of booleans.
  - APP: lib/assignments/{types,data,storage,actions}.ts; Settings > Policies (upload, open, archive) with a 3MB cap because Server Actions accept a 4MB body in this app (next.config.ts) and the whole request must fit; People > Assignments (assign panel with branch filter and select-these, outstanding list with due-date pills and Cancel, completed list linking to the Evidence); the staff "Assigned to me" list on /my (open the policy then confirm, or complete the form in the shared slide-over); /api/policies/[id]/file signs and audits the download, read through the CALLER'S RLS client so a staff member cannot pull a policy nobody assigned them.
  - FOLLOW-ONS: a policy over 3MB needs either a raised bodySizeLimit or a direct-to-storage upload; there is no reminder email yet when an assignment is coming due (it should ride the Phase 6 digest); assignment status is not shown on the Person record; and a new starter is not auto-assigned the standing policy set (rules by job title were offered and not taken).
  - BUILD FIX (same session): the first push of increment 1 went RED on Vercel. `lib/auth/guards.ts` defines the Profile role union and did not include 'staff', so `profile.role === "staff"` was a no-overlap type error. It compiled and failed at the type check. Fixed and green (deploy 610c014). LESSON: adding a role means adding it in FOUR places, the DB check constraint, lib/nav Role, lib/invites InviteRole, AND the Profile union in lib/auth/guards.ts.

- USERS SPLIT INTO ACTIVE AND PASSIVE (Phil, 2026-07-26). Settings > Users listed every profile in one flat list, so Team Member logins would bury the Admins and Managers (a 60 carer agency = 3 real users lost in 63 rows). Now two COLLAPSED groups, each with a count in the header: **Active users** (Admins, Managers, Supervisors: the people who run the service, and the ones you pay a seat for) and **Passive users** (Team Members: their own area only, free of charge). PASSIVE_ROLES = staff + team_member (the old read-only Viewer is passive too). Both start closed, so the page opens as two lines and you expand what you need. One shared renderUser() so the two groups can never drift apart. New components/settings/collapsible-section.tsx (client wrapper, server-rendered rows passed as children). NOTE ON THE WORD: "active" here describes what the login DOES, not the account status pill on each row, which is why both headings carry a subtitle.

- FREE STAFF SEATS: THE HALF I MISSED (found 2026-07-26 while checking Charlotte test's first login). Migration 0131 excluded role='staff' from `company_active_user_count`, which is what the CUSTOMER sees on Settings > Billing. But four other counts still counted every active profile except platform_admin: `getActiveSeatCount` in lib/billing/stripe-sync.ts, which is the quantity actually PUSHED TO STRIPE, plus the founder home, founder revenue and founder companies list, plus the company drill-in. So a company with more logins than its allowance would have been BILLED for its carers while the app told them they were within their seats, and founder revenue would have over-reported MRR. It had not bitten yet only because Acme is Enterprise (6 included) with 3 billable users, so extraSeats() was 0 either way. FIXED by centralising: `NON_BILLABLE_ROLES` + `isBillableSeat(role)` in lib/billing/seats.ts, now used by the Stripe sync and all four founder counts. STANDING RULE: every seat count, on screen or on an invoice, goes through isBillableSeat. A new non-billable role means one edit, not five.

- POLICIES ARE SIGNED DOCUMENTS (Phil, 2026-07-26, migration 0135). Phil: "i want the a document / policy issuer to be something that the team member has to sign, think docusign / adobe". Both rules around it are the COMPANY's, by his answer: `policy_config.signature_mode` (draw / type / either) and `policy_config.reassign_on_new_version` (always / ask / never), set in Settings > Policies under "How signing works", defaults either + always.
  - SIGNATURE: the acknowledgement form carries BOTH a drawn `signature` field and a typed `signature_typed` field, and `lib/assignments/signing.ts` filters the RENDER to whichever the company allows (same render-side pattern as removeField, so the stored form and its server validation never diverge). Requiredness is enforced in the action, not by a required flag, because it depends on the mode. A drawn signature is converted to a PNG and stored as an evidence FILE with kind 'signature' (dataUrlToPngBuffer, which existed unused until now), so the frozen answers hold a reference, not a base64 blob.
  - VERSIONS: `company_policy_versions` keeps every version's document for good, because a signature against v1 proves nothing about v2 and you must be able to produce the exact wording signed. `assignments.policy_version` names the version each assignment is for. `uploadPolicyVersion` bumps the version, keeps the old file, and on "always" reassigns everyone who ever held it AND cancels their still-open assignment for the old wording (signing superseded wording proves nothing).
  - CERTIFICATE (chosen over stamping the original PDF, which would have needed pdf-lib): `lib/assignments/certificate.tsx` renders a one page branded Certificate of signature naming the policy, the VERSION, the signer, the exact Europe/London timestamp and the signature itself, drawn or typed. Served on demand at /api/assignments/[id]/certificate from the frozen Evidence, like the evidence PDF, and audited on download. The policy document itself stays the untouched master.
  - The policy title, version, signer name and date are stamped by the SERVER, never asked of the signer, so a signature can never name the wrong document.
  - Phil also chose "nothing more for now" for the staff area: no training, no check dates, no absence record.

- NEW VOCABULARY, CONFIRMED: **BRIEFINGS** (Phil, 2026-07-26). "Assignments" was the wrong name and the wrong place: it is now its OWN top-level department, out of People, called **Briefings**. Chosen by popup over Issued, Read and Sign, and Handbook. Ruled out before asking: **Sign Off** (collides with the supervision sign-off chain) and anything with **board** (breaks the standing terminology rule). A briefing = something you send the team and expect back, a policy to read and sign or a form to complete, so one word covers both and reads naturally from both sides: a Manager sends one out, a Team Member sees "My briefings". Taking one back is **Withdraw**, not Cancel. Route /briefings, own nav icon, Manager and above; the old /people/assignments route is removed. The DB table stays `assignments` (internal, invisible to customers).

- RECURRING INVOICING FIXED + RECURRING INVOICES MADE OPENABLE AND EDITABLE (2026-07-27). Phil reported "the recurring invoicing isn't working". Diagnosis first: it was NOT failing to run. The only schedule in the database (Acme, every 4 weeks, created 21/07) had next_run_date 2026-08-17, because createInvoice sets the first run to the issue date plus one FULL interval, so nothing had ever been due. The cron itself is proven live: /api/cron/daily-digest (0 6 * * *) wrote 87 notification_log rows at 06:02 on 27/07, and /api/cron/invoicing (0 7 * * *) uses the identical CRON_SECRET fail-closed pattern, so the secret is set and Vercel is firing it. What was actually wrong was three bugs waiting for 17 August, plus no way to see any of it work.
  - (1) PENNY BUG. cron.ts drafted lines with `Math.round(quantity * unit_price_pence)` and totalled with `computeTotals` — the rounded-unit-price maths the BUILDER moved off on 21/07. On Phil's own schedule line, Care 15m single x14 at unit_price 638 (£6.375 rounded to £6.38) billed £89.32 where the correct figure is 14 x 0.25hr x £25.50 = £89.25. 30m and 1hr lines happen to come out exact, which is why it hid. A recurring invoice and a hand built one for the same care did not agree.
  - (2) WEEK GROUPING LOST. invoice_schedule_lines DO store period_start/period_end (Phil's rows carry 29/06 to 05/07) but the cron never selected or copied them, so a recurring draft had no "Week: dd/mm/yyyy to dd/mm/yyyy" headers on screen or in the PDF.
  - (3) FROZEN QUANTITIES. The cron replayed the lines captured when the schedule was created and never re-read the care plan, so a Service User whose care plan changed (plans are versioned since 0099) would be billed the old plan silently, forever.
  - THE FIX. New PURE module `lib/invoicing/care-plan-billing.ts` (BuilderLine, PlanEntryRow, HANDED_SUFFIX, addDaysUtc, rateLookup, buildCarePlanLines) lifted out of invoice-actions.ts, so the builder (user session, RLS client) and the cron (service client, no session) expand a care plan through ONE code path and agree to the penny. `carePlanLinesForPeriod` is now a thin fetch-and-delegate wrapper. cron.ts gained `draftFromSchedule(supabase, schedule, runDate)` plus exported `ScheduleRunRow` / `SCHEDULE_RUN_COLUMNS`; `runRecurringInvoices` claims as before then calls it. Lines are re-derived from the care plan whenever the schedule was built from one (marker: its lines carry period_start) and the plan covers the period, falling back to the frozen lines so a client can never get an empty invoice — and BOTH paths now price with `lineAmountPence`, so even a replayed flat line is exact. period_start/period_end are carried onto invoice_lines.
  - BILLING PERIOD, agreed by popup 2026-07-27: IN ARREARS. New `billingPeriodFor(runDateIso, frequency, interval)` in types.ts — a run bills the cadence that has just finished, so a 4 weekly schedule running Mon 17/08 bills the 28 days ending Sun 16/08 and a monthly one bills the month just gone. Phil's reasoning accepted: you invoice care actually delivered, so nothing needs crediting back if the care changed or the client was in hospital, and it matches his own test invoice (issued ~20/07 for 29/06 to 05/07).
  - OPENABLE AND EDITABLE (Phil, same session: "there is a tile for AAAA AAAAAAA, when i click it nothing happens", then "if its clickable it could be editable"). The tiles on /invoicing/schedules were plain divs with only a Cancel button. Each schedule now has its own record at /invoicing/schedules/[id]: what it bills and the exact next period, whether it reads the care plan (with a link to the plan and the row count) or repeats fixed lines, an editable cadence / day-of-week / day-of-month / next-run-date form through ActionForm, the lines, the invoices raised from it, and Cancel. New `getSchedule` + ScheduleDetail in data.ts; new `updateSchedule` + `draftScheduleNow` actions. Tiles are now links and show dates as dd/mm/yyyy.
  - "DRAFT IT NOW" closes the untestable gap: it runs the SAME draftFromSchedule the cron runs, bills the cadence ending yesterday, and DELIBERATELY does not advance next_run_date, so trying it never shifts a live client's billing date. It audits as invoicing.schedule_drafted_manually and redirects to the drafted invoice.
  - NOTE the test client "AAAA AAAAAAA" (id 4442c6fb, Caerphilly, private invoicing on, invoice email = Phil's gmail) is the straddle-week test Service User from 21/07. 9 current care plan rows, 30 across all versions.

- REGISTERED ROLES NOW GET THEIR EMAILS (2026-07-27). Known gap from the roles overhaul: notification recipients still keyed on role='manager'/'company_admin', so Registered Individual and Registered Manager received NO daily digest, no chaser, no briefing overdue list and no holiday approver email; they saw everything in app and nothing by email. Fixed in ONE place rather than at every call site: `getRecipients` (lib/notifications/data.ts) now selects the two Registered roles and NORMALISES them to company_admin on the Recipient, because they are company wide exactly like an Admin — so scopeItems, scopeReporting, overdueForRecipient and both filters in the daily-digest route do the right thing with no further edits. Recipient gained `trueRole` for transparency. lib/notifications/holiday.ts widened its own approver query and its branch filter now keeps any company-wide role. settings-actions.ts lets the Registered roles hold an SMS number.

- REVIEWED COLD BEFORE PUSH by a subagent reading every changed file for missing exports, dangling symbols after the extraction, the "use server" async-only rule, circular imports, server-only in a client component, status union typing, SupabaseClient assignability and JSX/entity errors. No compile or lint errors found. NOT built on Phil's machine and NOT tested live yet — see Final Testing.

- EDITABLE FORMAL LETTER TEMPLATES (2026-07-27, migrations 0139 + 0140). Until now the absence meeting invitation went out under the care company's name with wording hard coded in bookAbsenceMeeting, so a provider could not use the wording their own HR adviser approved even though the letter is a formal step in a capability process naming the stage and the right to be accompanied. Phil chose by popup: EVERY letter absence sends, built as a general letters system so probation and disciplinary letters can be added later without rework. New `company_letter_templates` + `company_letter_template_versions` (wording kept forever, because a letter already sent went out under the wording live at the time and a process can be challenged months later). Read = any company member (the sender runs as the Manager booking the meeting), write = Company Admin only. 0140 adds the ONE legitimate delete policy: putting a letter back to the standard wording removes the row so it reads from the packaged default again and later improvements reach them; the version history stays undeletable.
  - lib/letters/letters.ts is PURE (definitions, placeholder palette, merge + render) so the client editor can import it. Bodies are PLAIN TEXT with {{placeholders}}, escaped and rendered to HTML at send time: an Admin never authors raw HTML, which would break the email shell and open an injection path into mail we send for them. Unknown tokens are left exactly as typed so a mistake shows in the preview rather than vanishing from a legal letter. Functional parts (Accept / I cannot attend buttons, the calendar attachment, the Teams note) stay system rendered around the wording.
  - Four letters seeded from the CURRENT wording, so nothing changed until an Admin edits: absence_meeting_invite_employee, absence_meeting_invite_conductor, absence_meeting_rearranged (a paragraph inside the other two, so no subject of its own), absence_meeting_cancelled. Settings > Letters with a per letter collapsible editor, clickable placeholder chips that insert at the cursor, and a live preview with example values using the SAME merge the sender uses.
  - Wired into lib/absence/actions.ts: sendMeetingLetters now takes the Supabase client and reads the company wording for both invitations and the rearranged note; the cancellation notice renders its body AND its subject from the company wording (the subject is used for the dedupe claim too). Fixed during review: the conductor's copy passes recipient_name as the CONDUCTOR, not the employee.

- ABSENCE MEETING OUTCOME (2026-07-27, migration 0141). The Absence Management Meeting Records form recorded details, attendance review, discussion and minutes but NO OUTCOME, which is the worst possible gap in an absence file: at appeal the question is always what was decided, what they were asked to improve, by when, and whether they were told they could appeal. Version 5 adds an Outcome section: outcome of the meeting (required), warning issued, warning live until (only shown when a warning was given), improvement targets, review date, and "Outcome and right of appeal explained to the employee". Master template updated so new companies get it; Acme's copy published as version 5. Phil chose it ON the existing form (one form, one Evidence record) and deliberately NOT driving the absence stage, because the stage is already auto derived and overriding it from here would fight that logic.

- AI RETURN TO WORK (2026-07-27, migrations 0142 + 0143). Phil's standing rule is that a Return to Work happens after EVERY absence at EVERY stage, so the SYSTEM raises it rather than relying on a manager remembering. rtw_due_date + rtw_evidence_id live on absence_events (exactly one per absence, no new table), and a TRIGGER sets the due date to return-or-end date plus 3 the moment an absence gets one, so it fires for the bulk importer and any future write path too, not just today's action. Existing ended absences were backfilled. Outstanding = due date set, evidence null, with a partial index matching that filter.
  - New `return_to_work` master form seeded to every company: "Prepared for you" (AI drafted summary + questions, editable), the absence, the conversation (fit to return, ongoing symptoms, work related, adjustments, shown only when relevant), support and next steps (support agreed, referral, trigger point reached, follow up), and confirmation ending with the employee's signature.
  - AI drafting goes through the existing runAi, so it spends one AI credit and runAi refunds it if the call fails. The system prompt forbids diagnosing, speculating about a medical cause, or suggesting an outcome or disciplinary action: it prepares the manager, it does not decide. Nothing is stored until the manager completes the form, so a draft they dislike costs a credit and leaves no trace on the employee's file.
  - components/forms/form-evidence-dialog.tsx gained a REUSABLE `aiDraft` prop (action, label, hint) that merges the returned values into the answers and remounts the renderer on them, so any future AI assisted form gets this for free. ActionState gained an optional `data` for handing values back to a form; presentational only, never trusted on the way back in.
  - Surfaced as a Return to Work section on the Absence page, branch filtered, overdue first and red, with Record opening the form and "Draft it for me" filling the prepared section.

- REVIEWED COLD BEFORE PUSH by a subagent reading every changed file for missing exports, the "use server" async-only rule, server-only imports in client components, hook order, the 11 way Promise.all destructuring on the absence page, and regex damage from the python heredocs. No compile errors. It also established that this project has NO ESLint configured at all, so `next build` skips linting entirely and tsc is the only gate: unused imports will NOT fail a build here, which is worth knowing. Two defects it raised were fixed rather than logged. NOT built on Phil's machine and NOT tested live.

- LESSON, CONFIRM DIALOGS (2026-07-27, took three attempts): **a confirming button must not be a submit button.** A blocking window.confirm lets the click be REPLAYED once the dialog closes. Confirming on the form's submit event prompted twice for one press. Confirming on the click and calling preventDefault still prompted twice, but ONLY on Cancel: on OK the button is already disabled by `pending` so the replay is swallowed, while on Cancel nothing has changed so the replayed click asks again. That asymmetry (OK once, Cancel twice) is the fingerprint. FINAL FIX in ActionForm: when `confirm` is set the button is `type="button"`, asks, and on OK calls `formRef.current.requestSubmit()` deliberately. There is no default submission left to replay, and Cancel does nothing at all. Do not reintroduce a confirm on submit or a preventDefault-based confirm.

- DOUBLE CONFIRM ON DELETE FIXED (Phil, live test 2026-07-27): pressing Delete on an invoice showed the browser confirmation TWICE and needed OK twice. Only one window.confirm existed in ActionForm and only one delete form was rendered, so the cause could not be pinned by reading the code. Fixed structurally rather than guessed at: the confirmation moved off the form's onSubmit and onto the submit button's onClick, so there is exactly ONE call site and cancelling the click stops the submit before it starts. Affects every confirming button in the app, so re-check one other (Cancel a recurring invoice, Send an invoice) when testing.

- RETURN TO WORK FORM v2 — AGREED WITH PHIL 2026-07-27, NOT YET BUILT. His live review of the first version asked for: (1) the questions to become REAL FIELDS of mixed types (text, single select, yes/no) instead of the AI pouring everything into one long_text box, so they can be seen and answered clearly; (2) the "This absence takes them to a trigger point" checkbox REMOVED or made automatic, since deriveAbsenceStatus already knows the stage and Bradford score and asking a manager to restate it is wrong; (3) "Interview conducted by" to become a dropdown of company users prefilled with the logged in user but changeable (reuse listMeetingConductors, and copy the dynamic option injection that migration 0076 already does for the branch field rather than inventing a second mechanism); (4) a "completed over the phone" checkbox, and when it is ticked the signature captured becomes the SIGNATURE OF THE PERSON FILLING IT IN rather than the employee, so a manager conducting it by phone signs it themselves (implement as two signature fields driven by visibleWhen, after checking how a checkbox answer is stored, since VisibleWhen is { field, in: string[] } and may not match a boolean cleanly; a single select "In person / By phone" is the fallback and is arguably clearer); (5) the interview date to autofill to the day it is completed. Open point to settle when building: if the questions become fixed fields, what does the AI still draft. Recommendation is to keep the summary as an AI draft and replace the questions box with a small "anything else worth asking about this absence" box, so the AI ADDS to the standard set rather than replacing it. Full spec in project memory: bcc-rtw-form-v2-spec.

- RETURN TO WORK FORM v2 — BUILT (2026-07-28, migrations 0144 + 0145). All five of Phil's points from the live review, plus the AI prompt rewritten to match.
  - THE QUESTIONS ARE NOW REAL FIELDS. The single `suggested_questions` long_text is gone. A new "Health and fitness" section asks, as its own answerable fields: have they seen a doctor (yes/no), has a fit note been provided (yes/no), is any medication likely to affect their work or their driving (No / Yes / They are not sure, with a conditional detail box), and any outstanding medical appointments. "Is anything at work making it worse" joined the conversation section and "What support would help" joined support and next steps, alongside the kept `fit_to_return`, `work_related` and the conditional `adjustments_needed`. The point is that an answer now lands in Evidence AS an answer, so it can be read, reported on and defended, rather than being buried in a paragraph the manager may never have replied to.
  - TRIGGER POINT REMOVED. `trigger_reached` is deleted from the schema. deriveAbsenceStatus already knows the stage and the Bradford score, so asking a manager to restate it only creates a way for the form and the register to disagree, and the form would lose.
  - "INTERVIEW CONDUCTED BY" IS A REAL DROPDOWN, and this was the bulk of the work. It is now a `single_select` whose options are the company's own staff, BAKED INTO THE STORED SCHEMA the way migration 0076 bakes branches. It has to be baked, not injected in the browser, because lib/form-validate.ts validates a single_select on the SERVER against the stored published schema: an option the server has never seen is rejected on save. Staff list = every active profile in the company except platform_admin, matching the "who did this" list migration 0125 established for the Audit form, and deliberately wider than listMeetingConductors (company_admin + manager only) because a registered manager, supervisor or on call lead may well hold the interview and a dropdown they cannot choose from is a dead end when free text is not an option.
  - THE RE-BAKE ROUTINE, which fixes a rot 0076 has quietly had since it shipped: nothing ever re-baked the branch options, so adding or renaming a branch left every form offering yesterday's list. Migration 0144 puts the jsonb surgery in ONE SECURITY DEFINER function, `public.rebake_form_field_options(company_id)`, that refreshes BOTH the staff options and the branch options across every version of every form the company owns, and lib/forms/rebake-options.ts calls it. EXECUTE is granted to service_role only: the company id is a parameter, so exposing it to authenticated would let any signed in user rewrite another tenant's form options. Wired into every place the underlying list changes: accepting an invite and setting your name (app/welcome/actions.ts completeInvite), enabling or disabling a user (settings setUserStatus and founder founderSetUserStatus), deleting a user (settings deleteUser), renaming a branch (settings renameBranch), creating a company, which seeds its Office and first Branch (founder createCompany), and importing master templates, which arrive carrying the generic template options (founder founderImportTemplates). BEST EFFORT exactly like writeAudit: a stale dropdown is a far smaller problem than an administrator being unable to disable a user, so a failure is logged to the server console and never blocks the action it follows.
  - COMPLETED OVER THE PHONE. A `completed_over_phone` checkbox now switches WHOSE signature is captured: `employee_signature` is visible when it is false, and `interviewer_signature` ("Interviewer signature confirming a conversation held over the phone") when it is true, both through the existing visibleWhen. The trap that had to be designed around: isFieldVisible returns false when the controlling answer is undefined, so an untouched checkbox would have hidden BOTH signatures. The Absence page therefore PRESETS `completed_over_phone: false`, which makes the employee signature the visible default.
  - INTERVIEW DATE AUTOFILLS to today in Europe/London, still editable, using the existing todayInLondon + formatCivilDate from lib/recurrence.ts rather than a third definition of "today".
  - THE AI PROMPT now produces SUMMARY plus ALSO ASK: at most three points specific to THIS absence, explicitly told not to repeat any of the standard questions the form now asks itself, so the draft ADDS to the standard set instead of replacing it. The returned keys are `absence_summary` and `extra_questions`, matching the new schema. The guardrails are unchanged: never diagnose, never speculate about a medical cause, never suggest an outcome or disciplinary action.
  - Old Evidence keeps the version it was completed against. Both migrations are idempotent (0145 keys off the marker string completed_over_phone). NOT built on Phil's machine and NOT tested live.

- RETURN TO WORK FORM v3 — THE QUESTIONS ARE NOW WRITTEN BY THE AI, NOT FIXED (2026-07-28, migration 0147, the same day v2 shipped). Phil on seeing v2: "I wanted those question fields generated by the ai when they press 'draft it for me' as not every absence will be the same." He is right, and v2 was wrong: six fixed questions are the right questions for a back injury and the wrong ones for a run of single days, and a set asked every time trains a manager to tick through them.
  - THE CONSTRAINT THAT SHAPED THE ANSWER, worth understanding before anyone touches this again. Evidence is immutable and pins a form_version id, and lib/form-validate.ts validates every answer on the SERVER against the STORED published schema, single_select membership included. So a question the AI invented this morning CANNOT be an ordinary schema answer: the server has never seen its key and cleanAnswers drops it. Minting a form version per absence would make it work and would wreck the audit trail, leaving thousands of single use versions and no answer to "what is the Return to Work form". The questions therefore live in the browser only, and their ANSWERS land in one existing field.
  - v3 SCHEMA (0147). Removed the six fixed question fields v2 added (doctor seen, fit note, medication plus its conditional detail, outstanding appointments, anything at work making it worse, what support would help) and with them the whole Health and fitness section. Removed extra_questions too: it only existed so the AI could ADD to the fixed set, and now that the AI writes the questions a second box for the AI to write into is the same box twice. Added ONE long_text, tailored_questions ("Questions asked and answers"), to the Prepared for you section. Everything else v2 established is untouched: fit_to_return, work_related, the conditional adjustments_needed, support_agreed, conducted_by with its baked staff options, completed_over_phone and the two signatures it switches between, interview_date and absence_summary.
  - THE MODEL NOW RETURNS STRICT JSON: one object of summary plus 4 to 6 questions, each with a question, a type (text, yes_no or choice) and options where the type is choice, tailored to the reason, the length and the person's recent absence pattern. The guardrails are unchanged word for word: never diagnose, never speculate about a medical cause, never suggest an outcome or disciplinary action.
  - PARSED DEFENSIVELY, because a model that returns rubbish must not cost a manager their draft. Any markdown fence is stripped, JSON.parse runs in a try/catch, every entry is shape checked and a bad one is DROPPED rather than repaired, a choice with fewer than two usable options is asked as text instead, and the set is capped at six. If nothing survives, the reply is read as the old SUMMARY / ALSO ASK prose and the points land in the tailored_questions box as text, so the worst case is a draft that needs tidying rather than an error. lib/forms.ts holds the parsing and the serialising, so the Server Action validates the model's reply with the same code the browser parses it with.
  - RENDERED AS REAL CONTROLS. components/forms/form-evidence-dialog.tsx gained an optional aiDraft.questions of { dataKey, answerKey }. When the draft comes back carrying that key the dialog pulls it out of the data (it is not an answer to any field), renders each question as its own labelled control (a text box, a Yes/No pair, or a select), and HIDES answerKey from the rendered form so nobody is given two places to type the same thing. The answers are held on their own and folded into the answers object only on submit, because FormRenderer owns that object and reports the whole of it back on every keystroke.
  - STORED AS READABLE TEXT, deliberately. On save the whole set is serialised into tailored_questions as "Q: ..." then "A: ..." with a blank line between. Not JSON: Evidence, the PDF renderer, the exports and the on screen view already handle a long_text answer, so nothing downstream changed, and the record still reads like a record in five years. No new field type and no change to the form engine. The one thing touched downstream was whitespace-pre-line on the Evidence detail page, which was collapsing the line breaks of EVERY multi line answer into one paragraph, not just these.
  - Any future AI assisted form can use this: give it a long_text to land in and return the payload. Old Evidence keeps the version it was completed against. 0147 is idempotent (marker string tailored_questions) and re-bakes the conducted_by staff options into the brand new version, without which the dropdown would be empty and every save rejected. NOT built on Phil's machine and NOT tested live.

- EVIDENCE SIGNATURES SHOWED AS MISSING ON SCREEN AND PRESENT IN THE PDF (Phil, live test 2026-07-29). He ticked "Completed over the phone", signed, and the PDF read "Interviewer signature confirming a conversation held over the phone: Signature captured" while the Evidence detail page read "Not provided" for the same immutable record. A record that says a signature is missing on screen and present in the PDF is worse than either being wrong on its own, so this was traced rather than guessed at and then fixed for every Form, not just this one.
  - THE ACTUAL CAUSE. The shared renderer captures a drawn signature as a PNG data URL held in the ANSWER (components/forms/form-renderer.tsx, SignaturePad). Only the policy signing path converts one into a stored file with kind 'signature'. The Evidence detail page assumed every signature and every upload was a file row: it looked the field key up in evidence_files, found nothing, and printed "Not provided" without ever reading the answer. The PDF renderer reads the answers through the shared formatter (lib/form-format.ts), which has a signature branch, so it was right all along. Confirmed against the live row before changing anything: the answer held a data:image/png data URL and the record had zero evidence_files rows.
  - THE FIX. app/(app)/evidence/[id]/page.tsx now prefers the stored file when there is one (unchanged behaviour for policy signing and uploads) and otherwise reads the ANSWER through the same formatAnswerForDisplay the PDF uses, so the two can no longer word the same record differently. A drawn signature is also DRAWN on the page now, above the words "Signature captured", which is what an inspector actually wants to see. Its own displayAnswer copy of the formatting logic, the thing that let the two drift apart, is gone.
  - AND THE SAME DIVERGENCE IN REVERSE. The PDF only printed fields that pass the conditional visibility test while the page printed all of them, so the page showed "Employee signature: Not provided" on a phone interview where the PDF sensibly showed nothing. Both now filter through one new shared helper, shouldShowInEvidence in lib/form-validate.ts: a conditional field nobody was asked is left out, but anything that HAS a stored answer is always shown. An answer that exists must never be invisible in a compliance record.
  - WHICH FORMS WERE AFFECTED: every Form with a signature field completed through the shared evidence dialog, which is Return to Work and every People and Service User Check that captures one. NOT the policy acknowledgement, which stores its signature as a real file and always displayed correctly. The Evidence detail page was the only on screen renderer with the bug.
  - COSMETIC, SAME AREA: the PDF broke that long label mid word as "conversa tion". @react-pdf/renderer hyphenates by default and draws no hyphen, so it reads as a typo. lib/evidence/pdf.tsx now registers a hyphenation callback that returns each word whole, so long labels wrap between words. Contained, no column widths touched, applies to every Evidence PDF. NOT built on Phil's machine and NOT tested live.

- RETURN TO WORK FORM v4 — THE CONVERSATION IS AI WRITTEN TOO (2026-07-29, migration 0148). Phil on seeing v3: "'The conversation' tile ... needs to also be ai and relevent to the absence." Same argument that produced v3, and it applies just as well to what v3 left behind: v3 moved the six health questions to the AI and kept a FIXED core of five, so a manager was still asked the same five questions in the same words after every absence, which is exactly what trains someone to tick through them.
  - REMOVED, and nothing in the app reads any of them (checked across lib, components and app first, then removed): fit_to_return, ongoing_symptoms, work_related and the conditional adjustments_needed, and with them the whole "The conversation" section, plus support_agreed. They were only ever read back out of Evidence.
  - KEPT AS REAL FIELDS: referral and follow_up_date, now in a section called "Next steps". Those are record keeping, not interview questions, they record what the manager DID and when they will look at it again, and a structured referral plus a real date are worth more than the same facts buried in prose. Also kept: absence_summary, tailored_questions, "The absence" section, employee_comments, conducted_by with its baked staff options, interview_date, completed_over_phone and the two signatures it switches between.
  - THE GROUND THEY COVERED IS NOT DROPPED. The prompt in lib/absence/rtw-actions.ts is widened: the drafted set MUST now cover whether they feel fit to return, whether adjustments would help, whether anything at work caused the absence or made it worse, and what support would help, each in at least one question and worded for this particular absence, then spend the rest on what this absence actually calls for. The cap rises from 6 to 8 (AI_QUESTION_LIMIT in lib/forms.ts) and stops there, because a manager will not work through twenty and a set nobody finishes is worse than a shorter one they do. The guardrails are unchanged word for word: never diagnose, never speculate about a medical cause, never suggest an outcome or disciplinary action. The strict JSON parsing and the prose fallback are untouched.
  - The tailored_questions help text now spells out what the drafted set covers, so a manager who never presses "Draft it for me" still knows what to record in it.
  - Old Evidence keeps the version it was completed against, so a v3 record still reads with its conversation answers in place. 0148 is idempotent (marker phrase "whether they are fit to return", chosen with no underscores because underscore is a LIKE wildcard) and re-bakes the conducted_by staff options into the brand new version, without which the dropdown would be empty and every save rejected. Applied to the becarecompliant project only. NOT built on Phil's machine and NOT tested live.

- THE EVIDENCE PDF NOW DRAWS THE SIGNATURE INSTEAD OF DESCRIBING IT (Phil, 2026-07-29, same day as the page fix above). The page had just been taught to draw a drawn signature, but the PDF still printed the words "Signature captured" for the same record, so the inspector facing document showed a claim where the screen showed the signature. lib/evidence/pdf.tsx now checks a signature field's answer for a png or jpeg data URL (the same drawnSignature test the page uses, deliberately copied so the two read alike) and renders it with @react-pdf/renderer's Image, 180pt wide with the height left to the captured aspect ratio, so the 480x160 pad lands at 60pt tall and the ink is never squashed. The field label still prints in the row's left column exactly as every other field does, with a small "Signature captured" caption under the image, matching the page word for word. NO RECOLOURING: the pad already fills the canvas white and strokes in navy, so the image is drawn as captured, no tint, no theme colour, which is the standing rule after the white on white bug. Everything that is not a drawn signature is untouched and still goes through the shared formatAnswerForDisplay, so no private formatting copy has crept back in. FALLS BACK SILENTLY: a missing answer, a stored file path, a non image data URL or anything that is not a string returns null and the row prints the old text; and a corrupt data URL cannot fail the render either, because @react-pdf catches an image it cannot decode, warns to the server console and lays the node out at zero size. The Phase 8 Evidence pack picks this up for free, it shares EvidenceEntry. NOT built on Phil's machine and NOT tested live.

- OPTIONAL EMAIL DOMAIN ALLOWLIST FOR HAND TYPED INVITES (Phil, 2026-07-29, migration 0149). The invite box on Settings > Users is a free text field that provisions a login into an account holding staff Records and Service User Records, so one slipped character, or a personal address typed in out of habit, puts an invitation to that account in somebody else's inbox. A company can now name the email domains its own invites may go to. OFF BY DEFAULT and off for every existing company: an empty list behaves exactly as today and accepts gmail, outlook and icloud, because plenty of small providers run their whole office on personal addresses and must not be broken by a column appearing.
  - THE SCOPE IS THE FEATURE, and it was decided before a line was written. It gates ONE code path: inviteUser in app/(app)/settings/actions.ts, the action behind the invite form on Settings > Users, and nothing else. Phil: "companies wont give work email address out to employee at carer level." A carer's address on their Record IS a personal address by design, so enforcing it on the automatic Team Member (staff) invite would lock a company's entire care workforce out the moment an Admin switched the feature on. That path (lib/staff/invite.ts, reached from adding a person, from bulk import and from invite or resend on a Person) is untouched, as are Founder invites, briefings, invoice emails, notifications and every other outbound mail.
  - HOW THAT IS ENFORCED STRUCTURALLY RATHER THAN BY CARE. The check sits inside createAndSendInvite in lib/invites.ts, immediately after the existing isSendableAddress gate, so there is one door and not two competing ones, and it only runs when the CALLER passes the list in a new optional enforceEmailDomains field on InviteParams. inviteUser is the only caller in the codebase that sets it. The staff and Founder paths do not construct the field at all, so they cannot fail the check even by accident, and a future caller has to opt in on purpose.
  - THE REFUSAL NAMES THE DOMAINS, because a message that only says no leaves the Admin guessing at which of the address, the role or the branch was wrong. It reads which domains are allowed, tells them where to change the list, and repeats that Team Member logins are not affected.
  - SUBDOMAINS COUNT. mail.sunrisecare.co.uk passes when sunrisecare.co.uk is listed: a subdomain of a domain you own is still yours, branch and mail host subdomains are common, and the match is made on a dot boundary so a lookalike such as sunrisecare.co.uk.example.com is still refused. Because of that, a bare public ending (co.uk, org.uk, gov.uk, com.au and the rest) is refused when the Admin tries to ADD it, with an explanation, since allowing one would wave through most of the country.
  - NORMALISATION, in lib/invite-domains.ts, a pure module with no server-only import so a page, an action or a test can all use it. Whitespace stripped, lowercased, a leading @ accepted and dropped, so "@SunriseCare.CO.UK " and "sunrisecare.co.uk" store the same thing. Refused with a specific reason: empty, spaces inside, a whole email address, a leading or trailing dot, no dot at all, anything outside letters, numbers, dots and hyphens, over 253 characters, and the public endings above. Up to 25 domains per company.
  - STORAGE AND RLS. companies.invite_email_domains text[] not null default '{}' (0149). No new policy and none needed: companies_select is already any company member and companies_update is already is_company_admin(id) only, which is the same shape invoicing_config uses, so it is readable by the company and writable by a Company Admin by construction. The two write actions check the returned row count, so an RLS no-op surfaces as a visible error rather than a false "Saved". Both write an audit entry, company.invite_domains_updated, including the resulting list.
  - THE UI IS ON SETTINGS > USERS, where it takes effect, Admin only because the whole page already is. Add and Remove both go through ActionForm, so instant "Saving", a brief green flash and never a stuck green box, and the add form is keyed on the current list so a successful add clears the box. The copy says in as many words that it applies only to invites sent from that screen and that Team Member logins are never affected, and it states the subdomain rule outright, because an Admin reading "email domain allowlist" would otherwise assume it covers everyone and find out later. When a list is set, the invite card itself also shows the allowed domains above the form. NOT built on Phil's machine and NOT tested live.

- TRIAL REQUESTS ARE NOW A SCREEN, NOT AN EMAIL (Phil, 2026-07-29, migration 0151). When somebody presses Start free trial on the marketing site, submitTrialRequest writes one row to trial_requests and emails the platform admin, and that email was the ONLY place the lead was ever seen. Miss it, filter it, read it on a phone and forget it, and a person who asked to buy the product hears nothing back, with no way to find them again short of opening the SQL editor. /founder/trial-requests now lists every request newest first, with the company, the contact, the email, the phone, the tier they asked about, the team size, anything they wrote, where it came from and when it arrived.
  - IT PROVISIONS NOTHING, AND THAT IS THE POINT. Setup stays founder led. Marking a request Provisioned records that the founder has already created the company by hand on Create a company; no trigger, no automation, no tenant appears because a status changed. The page says so in as many words so the wording cannot be mistaken for a button that does it.
  - THE VOCABULARY CHANGED BY ONE WORD. 0086 shipped new/contacted/converted/declined. 'converted' is sales language and the console is read by the one person doing the work, so it is renamed to 'provisioned', which is what he actually does. Renaming rather than adding avoids two values meaning the same thing sitting in the dropdown for ever. Safe: 'converted' appeared nowhere in the application code, only in the 0086 check constraint, and any row carrying it is moved across before the constraint is replaced.
  - WHAT 0151 ADDS. status_changed_at and status_changed_by (uuid referencing auth.users, on delete set null, the same shape complaints, invoicing_config and holiday_requests already use), plus a free text notes column for chasing a lead over several days, plus an index on (status, created_at desc) because the only two questions ever asked of this table are "newest first" and "how many are still new". No new table: one status, one note and one who-moved-it per request, read on one screen, never joined.
  - SECURITY IS DELIBERATELY UNCHANGED. trial_requests is PUBLIC-facing data typed by an anonymous visitor. 0086 gave it exactly one policy, platform admin for ALL commands, and NO anonymous policy at all, because public inserts arrive through the service-role client which bypasses RLS. 0151 does not loosen it; it only re-creates that policy if it has somehow gone missing. So the status update is platform admin only IN RLS and not merely in the UI: a non-admin's update matches no policy and changes zero rows. The page itself is guarded by requirePlatformAdmin, the same guard every other founder page uses, and the action calls it again rather than trusting the page.
  - THE ACTION CHECKS THE ROW COUNT, so an RLS refusal surfaces as a visible error next to the button instead of a false green Saved. Status and note save together through ActionForm, so instant "Saving", a brief green flash and never a stuck green box. status_changed_at and status_changed_by are only stamped when the status genuinely moves, so editing a note does not rewrite the record of when the lead was last worked.
  - EVERYTHING ON THE PAGE WAS TYPED BY A STRANGER ON THE INTERNET, so it is rendered as ordinary React text, which escapes by construction, and nothing goes near dangerouslySetInnerHTML. The only attributes built from stored values are the mailto: and tel: links, and each comes from a guard in lib/founder/trial-requests.ts that returns null unless the value plainly is an address or a phone number, in which case the value is shown as plain text instead. That closes the one place an attacker-controlled string could have carried another scheme.
  - AUDIT. trial_request.status_changed (or trial_request.note_updated when only the note moved) through the shared writeAudit, entityType 'trial_request'. companyId is null ON PURPOSE: a trial request has no tenant yet, that is the whole point of the screen. audit_log.company_id is nullable, audit_log_select already passes every row for a platform admin, and a null keeps the entry out of a company's own audit trail where it does not belong.
  - THE COUNT IS ON THE CONSOLE LANDING PAGE, as a full width tile in the existing Library grid directly above Companies, carrying an amber "N new" pill when anything is waiting. No redesign: it is the same app-tile the other entries use and the same full width treatment Companies already has. NOT built on Phil's machine and NOT tested live.

- THE PUBLIC PAGES NOW SAY WHAT THE PRODUCT DOES, WHO IT IS FOR AND WHAT IT COSTS (2026-07-29, copy and markup only, no schema, no action behaviour). The marketing site read as software marketing rather than as a compliance product. The headline was "Inspection ready, every day.", which is a slogan a buyer cannot test, and the badge above it was carrying the actual proposition. A registered manager landing cold could not tell in five seconds what the thing does, and the price appeared nowhere above the fold. Scope was app/page.tsx, app/pricing/page.tsx, app/start-trial/page.tsx, components/marketing/* and the wording in lib/marketing/tiers.ts. Prices are untouched: Business £49, Pro £69, both plus VAT, two tiers only.
  - THE HEADLINE NAMES THE FEAR. "Inspection ready, every day." became "See every check that is overdue before your inspector does.", which is concrete, testable and about the reader rather than about us. The subhead now lists the actual checks (supervision, spot check, DBS, training, care plan review) across both registers, because naming them is the fastest available proof that this is built for care and not a general tool with care words painted on. The badge picked up "CQC and CIW" so the regulator is on screen before the fold. The mobile type scale dropped from text-5xl to text-4xl, sm and up unchanged, because eight words at 48px on a phone pushed everything else below the fold.
  - THE PRICE IS NOW IN THE FOLD. A line under the hero buttons reads "From £49 a month plus VAT. No card needed, and we set the trial up for you." The homepage pricing heading changed from "Simple, per service pricing" to "£49 or £69 a month, per care service". The one question every buyer asks first should not require a click.
  - ONE REDUNDANT BAND REMOVED. The "Compliance should not live in a spreadsheet" problem band and the "Built for care, better by design" band said the same thing twice in a row and both restated the hero. They are now a single band, "Built for care, not bent into shape", carrying the three differentiators. The page had seven three-card grids; it now has six, and the feature spotlights start higher.
  - WHAT A USER IS, ANSWERED AT LAST. The pricing page never said whether a 60 carer service pays for 60 seats, which is the objection that kills the sale. NON_BILLABLE_ROLES in lib/billing/seats.ts already makes the staff self-service login free (Phil's rule, 2026-07-26), so the pages now say so out loud: a new "How the pricing works" section on the pricing page defines what a plan covers, what counts as a user, that carer logins are free and how VAT and the trial work; the pricing table row reads "Users included (carer logins are free)"; PRICING_FOOTNOTE leads with VAT and defines a user; and a new homepage FAQ answers it directly. No number changed, only the explanation.
  - STALE AND SOFT CLAIMS REMOVED. The pricing page metadata still advertised "Business, Pro and Enterprise plans" months after Enterprise was dropped, and quoted the four user allowance as if it applied to both tiers; both fixed. "Why care teams choose us" implied a customer base we do not yet have and became "Compared with how most services do it today". "Nothing slips through" became "You hear about it early", because the first is a guarantee no software can make and this is a regulated sector. "UK data, kept private" left the trust row because data residency is not something the marketing pages can evidence; "Audit trail on every record" replaced it, which the audit log actually does.
  - THE DUPLICATE CTA ON PRICING IS GONE. "Start free trial" and "Talk to us" both pointed at /start-trial, so the second button was a dead end dressed as a choice, and the section offered "usage based plans or partner arrangements" that do not exist. It is now one primary CTA plus a plain mailto to hello@becarecompliant.com, the address the trial action already fails over to.
  - THE TRIAL PAGE ASKS FOR LESS AND EXPLAINS MORE. Field names, the action, the required set and the honeypot are byte for byte unchanged, so submitTrialRequest still captures the lead and notifies the founder and still provisions nothing. What changed is the framing: the four genuinely optional fields are labelled "(optional)" instead of the three required ones carrying a bare asterisk nobody explains, the email field gained a hint saying where the logins go, the plan dropdown shows the prices, a three step "what happens next" strip sits above the form, and a line under it says what the details are used for and that we do not need anything about the people they support to get started. The success state now adds that a person reads every request and that nothing is charged until logins are sent.
  - ACCESSIBILITY, THE REAL ONES ONLY. text-white/40 and text-white/45 on the navy background measure roughly 3.6:1 and 3.9:1, under the 4.5:1 AA floor for small text, and were carrying real information (the price line, the trial reassurance, the pricing footnote, the footer). All raised to text-white/60, about 6.9:1, with no change to the palette. Both marketing tables gained scope="col" and scope="row" and turned their first column into th, so a screen reader announces "Complaints management, Business, not included" instead of three loose values. The tick and cross glyphs carried aria-label on a bare span, which is ignored on a generic element, and now carry role="img" with it. The empty corner cell of the pricing table gained an sr-only label. Heading order was already correct and was left alone.
  - VOCABULARY. Two uses of "board" and one of "item", all banned on this project, are gone. Copy now uses Record, Register, Check, Form and Evidence where it means them. No dashes anywhere in customer facing copy, checked by grep across all five files. NOT built on Phil's machine and NOT tested live.

## Phase 11 — Final Testing

LETTERS (added 2026-07-27, not run live):
- Settings > Letters: edit the absence meeting invitation, save, book a meeting, and confirm the EMPLOYEE's email carries the new wording with the placeholders filled and the Accept / I cannot attend buttons still working.
- Confirm the conductor's chairing copy is addressed to the conductor and still reads unambiguously as "you are chairing this", not "you are invited".
- Rearrange a meeting and confirm the rearranged paragraph appears at the top of both letters.
- Cancel a booking and confirm the cancellation email uses the company wording for BOTH the subject and the body.
- Use the standard wording button, then confirm the letter reverts to the packaged default and the history still shows what they had.
- Type a deliberate typo placeholder such as {{employee}} and confirm it appears verbatim in the preview rather than disappearing.

ABSENCE MEETING OUTCOME (added 2026-07-27):
- Record a meeting and confirm the new Outcome section appears, the outcome is required, and "Warning remains live until" only shows once a warning is selected.
- Confirm old Evidence recorded before this change still opens against its own older version.

RETURN TO WORK (added 2026-07-27):
- Give an open absence an end date and confirm a Return to Work appears on the Absence page due 3 days later.
- Press "Draft it for me" and confirm the summary and questions fill in, one AI credit is spent, and the wording never diagnoses or suggests an outcome.
- Confirm a failed AI call refunds the credit (unset the key or force an error).
- Complete it and confirm Evidence is stored against the PERSON, the entry leaves the outstanding list, and it cannot be recorded twice.
- Confirm a Branch Manager sees only their own branch's outstanding Return to Work interviews.
- Confirm the bulk importer path also raises one, since the trigger rather than the action sets the due date.

RETURN TO WORK FORM v2 (added 2026-07-28, migrations 0144 + 0145, none of this has been run live):
- Open a Return to Work and confirm the new "Health and fitness" section appears with the doctor and fit note questions as Yes/No buttons, and that choosing Yes or "They are not sure" on the medication question reveals the detail box and choosing No hides it again.
- Confirm the trigger point checkbox is GONE, and that the stage shown on the Absence register is unchanged by any of this.
- Confirm "Interview conducted by" is a dropdown listing your real staff, that picking a name SAVES (this is the one that proves the options are baked into the stored schema rather than injected in the browser: if it was injected the server would reject it), and that the form still saves with it left blank.
- Confirm the interview date is already filled in with today's date and can still be changed.
- Confirm the Employee signature pad is showing before anything is clicked, then tick "This interview was completed over the phone" and confirm it swaps to the interviewer signature, and untick it and confirm it swaps back.
- Press "Draft it for me" and confirm the summary fills in and "Anything else worth asking" gets at most three points SPECIFIC to that absence, with no repetition of the standard questions, no diagnosis and no suggested outcome.
- Complete the whole form and open the resulting Evidence: confirm every new answer is stored and readable, and that only the signature that was visible was captured.
- RE-BAKE, the part most likely to rot silently. Rename a branch in Settings > Branches, then open ANY form with a branch field and confirm it offers the NEW name (before this round it would still have offered the old one). Then invite a user, accept the invite, and confirm the new name appears in "Interview conducted by" without anyone running a migration. Then disable that user and confirm the name disappears.
- Confirm a re-bake failure cannot block the action it follows: it is best effort, so disabling a user must still succeed and simply log to the server console.
- Confirm Evidence recorded against version 1 yesterday still opens showing version 1 (with its old questions box and trigger point checkbox), not version 2.

EVIDENCE PDF SIGNATURE IMAGE (added 2026-07-29, not run live):
- Complete a form that captures a drawn signature, open the Evidence page and confirm the signature is drawn there, then download the PDF and confirm the SAME signature is drawn on it at about a third of the value column's width, in the dark ink it was signed in, with the field label on the left and "Signature captured" under the image; then check a form with an unsigned or file backed signature field still prints the old wording rather than a blank space.


RECURRING INVOICING (added 2026-07-27, none of this has been run live):
- Open /invoicing/schedules, click the AAAA AAAAAAA tile, confirm it opens the new record instead of doing nothing.
- On that record press "Draft it now". Confirm: the button reads "Drafting…" then flashes "Drafted", it lands on the drafted invoice, the invoice covers the 28 days ending yesterday, the lines are grouped under "Week: dd/mm/yyyy to dd/mm/yyyy" headers, and next_run_date on the schedule is UNCHANGED (still 2026-08-17).
- Check the maths on that draft against the care plan by hand. A Care 15m single line must price at quantity x 0.25 x the hourly rate, so 14 units at £25.50/hr is £89.25 and NOT £89.32. This is the bug the whole fix exists for.
- Change the care plan (add or remove a visit), draft again, and confirm the new draft reflects the CHANGE rather than the quantities frozen on 21/07.
- Edit the schedule: change the cadence, the weekday and the next run date, Save, reload, confirm all three stuck.
- Let the real cron fire (or wait for 17/08) and confirm the automatic path drafts the same shape as the button did.
- Confirm a flat (non care plan) schedule still replays its own lines, and that its amounts are now exact too.
- Overdue reminder emails send and dedupe weekly (still needs CRON_SECRET).

REGISTERED ROLES AND NOTIFICATIONS (added 2026-07-27):
- Set a test user to registered_manager, give them something overdue, run the digest, and confirm they now receive the daily digest, the chaser and the briefing overdue list, scoped to the WHOLE company (not one branch).
- Submit a holiday request and confirm a Registered role receives the approver email even when they are not attached to the request's branch.
- Confirm a Branch Manager is still scoped to their own branch only, i.e. the normalisation did not widen the wrong role.


Anything not tested at build time is logged here immediately with enough detail to test cold.

- ON CALL FINALISE FLOW LOCKED (logged 2026-07-25). PERMANENT UX RULE, confirmed by Phil live: the shift edit page has ONE button, Save. Save saves the shift, flashes green for ~2s, and immediately opens the finalise popup ("Shift saved. Finalise it now?" with Yes, finalise / Not yet). NEVER reintroduce a separate "Finalise shift" button (Phil explicitly rejected the two-button flow). Root cause of the earlier "broken popup" reports: single-session (claim_session) kicks the other window whenever the same user signs in twice; the kicked window's next Server Action white-screened because the app had no error boundary. Fixed 2026-07-25: app/(app)/error.tsx renders "Your session has ended" + Sign in button; resolveFollowUp redirect() removed; shared ActionForm now does the 2s Saved flash + honours redirectTo. PASSED live by Phil 2026-07-25 (deploy 92c56c8): the On Call Save-then-popup flow end to end. STILL TO TEST COLD: (1) the session-ended screen actually renders in place of the white screen (sign the same user in from a second browser, then click Save in the first); (2) ActionForm 2s flash-then-revert on a non On Call page (e.g. Settings branches) since the shared component changed; (3) on_call ROLE live pass (needs a real on_call login): bespoke flat nav, redirects, rota grid and urgent follow-ups dashboard card as that role.

- COMPLAINTS FORMAL RULE (logged 2026-07-25). PERMANENT: the Type field (Formal/Informal) ALONE decides the formal investigation + response flow; the Complaint/Concern category does not gate it (Phil's popup decision, never revert isFormalComplaint to concern_type-based). Verified live by Phil 2026-07-25 on ACC25073 (Minor Complaint + Formal now shows the forms and the 19/08/2026 deadline; migration 0124 backfilled open Formal cases). STILL TO TEST COLD: (1) editing a case's Type from Formal to Informal clears the response deadline; (2) Informal to Formal derives a deadline from the raised date; (3) a new Informal case shows the "This case is informal" wording with no deadline.

- DASHBOARD REDESIGN (logged 2026-07-17). VERIFIED LIVE as Admin: People 13/3/12, Service Users 6/6/9, Complaints 1/0/0, all matching person_rollup/service_user_rollup + SQL; empty states clean for Holidays (0 pending) + Absence (0/0). Overdue-from-rag fix verified. STILL TO TEST COLD (Thistle has no pending holiday / no due absence meetings right now): (1) Holidays "Pending requests" shows a real non-zero count when a request is pending; (2) Absence "Meetings to book" lists real name+stage when someone's derived stage exceeds their last meeting; (3) Absence "Meetings in next 7 days" lists real name+stage+date for a booked, unrecorded meeting within 7 days, and the "+N more" overflow past 5; (4) all cards' clickthroughs land on the right screen; (5) branch scoping for a Branch Manager (cards reflect their branch only).

- ROLES & PERMISSIONS OVERHAUL (Item 8, logged 2026-07-17). Full checklist in TEST-CHECKLIST-ROLES.md. Migrations 0077-0081 applied; deployed. Structural verification DONE (SQL): is_company_wide/is_branch_member/is_branch_manager/is_person_supervisor/is_service_user_supervisor bodies match the agreed matrix; the 6 new policies (Viewer SELECT on service_users + check_instances via is_branch_team_member; Supervisor insert/update on absence_events + absence_meetings via is_person_supervisor) present and correct. BUG found + fixed live (0081): profiles_role_check didn't include the Registered roles, so accepting a Registered invite would have failed; fixed. TESTED LIVE IN CHROME 2026-07-17 — Registered Manager (logged in as ficklephil@me.com): PASS — all branches (People register All-branches/26 records), full manage (Add person, Training/Holiday/Absence sub-nav), Dashboard + Complaints + Reports open, Settings BLOCKED (not in nav, /settings redirects to /dashboard). STILL TO TEST COLD (needs a real login per role; single-session blocks parallel testing): (1) Registered role actually APPROVING a holiday (needs a pending request to click); (2) SUPERVISOR full checklist — sees everything in their branch only, completes checks, logs absences, submits a holiday that lands PENDING, CANNOT approve holidays, no Complaints/Settings, cannot touch other branches; (3) VIEWER full checklist — read-only People + Service Users only, bounced off Dashboard, no edit/complete/add controls, no Evidence, no Holiday/Absence/Reports/Complaints/Settings. TEST USERS currently repurposed in Thistle for these checks then RESTORED (see below): to run the cold checks, re-repurpose via SQL — phil3107@me.com -> supervisor (Cardiff1), ficklephil@me.com -> registered_manager, ppdavies+seat1@gmail.com -> team_member + status active; restore after to phil3107=manager, ficklephil=manager, seat1 status=disabled. KNOWN GAP (not blocking): daily digest + holiday-approver EMAILS still key on role='manager', so Registered roles don't receive those emails yet (they see everything in-app); fix when polishing notifications.

- PHASE 9 FOUNDER CONSOLE cold checks (logged 2026-07-14, updated after a second live pass). Full list in TEST-CHECKLIST-PHASE9.md. DONE live: dashboard, drill-in, cross-company disable/enable, revenue, health, manage-as enter/operate/exit, training edit + deactivation-does-not-seed, mobile layout on home + revenue. Then tested with a Company Admin login (Phil signed Claude in as Akram, 2026-07-14): cross-tenant guard PASSED (/founder, /founder/revenue, /founder/companies all redirect the Admin to their own /dashboard) and forged-cookie-inert PASSED (a fake bcc_manage_as cookie granted nothing). Single-session non-interference verified by design (manage-as never touches the tenant Admin's session). Invite RESEND + REVOKE on a founder drill-in PASSED 2026-07-14 (seeded a pending invite, revoked it, resent it with a real email to Phil's +alias, revoked to clean up; both audited). ONLY REMAINING Phase 9 item: the 30-minute manage-as auto-expiry actually lapsing (code correct: 1800s cookie + token exp; can't be fast-forwarded). Optional: a fully concurrent single-session live test.
- SEED BUG (found + fixed 2026-07-14, migration 0062): seed_company_people_checks failed on every new company with "column amber_days is of type integer but expression is of type text" because the all-NULL amber_days column in its VALUES list was inferred as text. New companies were created WITHOUT their 5 People checks (Service User checks, forms and training were fine). Fixed by casting v.amber_days::int; verified. STANDING GOTCHA: an all-NULL column in a Postgres VALUES list is typed text, so cast NULLs (null::int) when inserting into a typed column from a VALUES source. Only Thistle exists as a real company and it already had its checks; if any company was created between the amber_days addition and 0062, re-run seed_company_people_checks for it.
- MANAGE-AS IMPERSONATION AUDIT TAG: DONE 2026-07-14. writeAudit now reads the manage-as cookie; when present it sets actor_role = "platform_admin" and adds metadata { impersonating: true, acting_company_id } to EVERY audit row written during a manage-as session, centrally (no per-action changes). Also the manage-as dashboard greeting now reads "Support session: <Company>" instead of "Welcome, <founder email>". Remaining manage-as cold checks: 30-minute auto-expiry actually lapsing (code correct, can't fast-forward). Single-session non-interference confirmed by Phil (can't run two browsers) and safe by design.
- HOLIDAY EMAILS (logged 2026-07-12, Phil's popup decision): F1-F4 of TEST-CHECKLIST-PHASE6.md (request -> approver email, approve/decline -> requester email, decision dedupe) cannot be tested until the public no-account forms exist (approvers cannot self-request, Team Members have no logins). Test them as part of the public-forms Additions build. The code paths (notifyHolidayRequested / notifyHolidayDecided in lib/notifications/holiday.ts) are wired and the email infrastructure is proven by the meeting letters. UNBLOCKED 2026-07-26: the public holiday form shipped, so F1-F4 are now testable end to end without any Team Member login (submit at /f/<slug>/holiday_requests, approve or decline in People > Holiday).
- PUBLIC FORMS (logged 2026-07-26, built same day, migrations 0126 + 0127). NOTE: now HIDDEN behind PUBLIC_FORMS_ENABLED=false, so these checks only run if that flag is flipped back on. HOLIDAY CANCEL / WITHDRAW / AMEND / CLASH / HISTORY (0130) needs its own live pass instead: (a) Manager cancels a pending request, then an approved one, reason required, person emailed, holiday leaves the calendar and appears under Declined and cancelled; (b) the in-app submitter withdraws their own pending request, no email to themselves, and CANNOT withdraw once approved; (c) Edit dates on a pending and on an approved holiday, calendar moves, person emailed, end-before-start refused; (d) the clash warning lists the right people and counts, and shows nothing when there is no overlap; (e) a Supervisor and a Viewer see no management buttons. TO TEST LIVE: (1) MATCHED path: create the link in Settings > Public forms, open /f/<code> signed out, submit with a personal email that matches an active Person, then confirm the Evidence is on that person's record, a PENDING holiday request appears in People > Holiday, and the approver email arrives (checklist F1); (2) approve and decline it and confirm the submitter receives the decision email at the address they typed, with no CTA button (F2-F4); (3) UNMATCHED path: submit with an unknown email, confirm it lands in People > Submissions as Not matched with NO Evidence and NO holiday request, then Link it to a Person and confirm the Evidence, the pending request and the approver email all appear at that point; (4) Discard removes it from the queue; (5) switch the link off and confirm the page shows "This form is not available"; (6) a nonsense code shows the same neutral message, and after Issue a new link the OLD code shows it too while the new one works; (7) rate limit: 6 submissions inside 10 minutes, the 6th is refused with the wait message; (8) honeypot: a filled hidden field returns the thank you but writes nothing (check public_form_submissions); (9) AMBIGUOUS match: give two active people the same personal email, submit, confirm it goes to the queue rather than picking one; (10) a LEAVER's email does not match; (11) Branch Manager scoping on the queue and the dashboard "Submissions to link" card; (12) the Submissions list updates live (realtime) when a submission arrives.
- TEAM MEMBER LOGINS (logged 2026-07-26, migrations 0131 + 0132). PARTLY PASSED LIVE 2026-07-26 on a real address (Charlotte test, a real person's inbox): person created with 6 checks applied, invite created with role staff and email_sent true, profile created as role staff status invited, people.profile_id linked immediately, and billable seats stayed at 3. STILL TO TEST LIVE: (1) add a Person with an email and confirm the invite email arrives, the profile is role staff, and people.profile_id is set; (2) accept it, set a password, and confirm the login lands on /my with their name, their branch and their job title; (3) SEATS: confirm Settings > Billing seat count does NOT move when staff are added (the whole pricing question); (4) the staff login requests holiday, it appears as pending in the Manager's Holiday screen, and the approver email fires; (5) the staff login changes the dates and then withdraws it while pending, and CANNOT do either once approved (check the RPC refuses, not just that the button is hidden); (6) "Forms I have sent in" lists their own submission and NOT a supervision their manager wrote about them (the evidence_select NOT is_staff() clause); (7) a staff login typing /people, /service-users or /dashboard is bounced to /my, and typing another page returns nothing rather than someone else's data; (8) bulk import 3 people with emails and confirm 3 invites go out and the summary reads "invited 3 to their own login"; (9) a Branch Manager (not an Admin) adding a person also triggers the invite, exercising the widened invites_insert policy; (10) re-adding the same email does not error (already-pending treated as success).
- POLICY SIGNING (logged 2026-07-26, migration 0135). TO TEST LIVE: (1) set signature_mode to each of draw, type and either in Settings > Policies and confirm the signing dialog shows only the right field each time; (2) sign by DRAWING on a phone, and confirm the Evidence has a signature FILE (not a base64 answer) and the certificate shows the drawn image; (3) sign by TYPING and confirm the certificate shows the typed name and the "accepted as their signature" wording; (4) try to sign without signing and without ticking, and confirm both are refused; (5) upload version 2 with reassign=always and confirm everyone who signed v1 gets a NEW assignment for v2, their old open ones are cancelled, and v1's document still opens; (6) repeat with reassign=never and confirm nobody is reassigned; (7) open the certificate as the person who signed, as their Branch Manager, and as someone from another branch (that last one must fail); (8) confirm the certificate names the VERSION signed, not the current version, after a v2 upload.
- ASSIGNMENTS AND POLICIES (logged 2026-07-26, migration 0133). TO TEST LIVE: (1) upload a policy in Settings > Policies and open it, confirming the signed URL works and the open is audited; (2) assign it to several people at once from People > Assignments, then re-run the same assignment and confirm nobody gets it twice ("They all had this already"); (3) as a Team Member, open the policy, tick the box, and confirm the Evidence exists against their record with the policy title, version and date, and the assignment closes; (4) assign a FORM, complete it as the Team Member, and confirm the Evidence and the closed assignment; (5) a staff member cannot open a policy that was never assigned to them (hit /api/policies/<id>/file directly); (6) Cancel an assignment and confirm it leaves their list; (7) a due date in the past shows Overdue on both screens; (8) a Branch Manager can assign to their own branch only.
- TWILIO LIVE SMS (logged 2026-07-12, Phil's popup decision): the SMS path (lib/sms/twilio.ts), per-segment metering into usage_events, company opt-in and the 14-day overdue escalation are built but no Twilio account exists yet. When set up (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM in Vercel): run checklist D3-D5 (real SMS to a Manager/Admin phone, usage_events sms rows, Usage page shows segments, second number metered separately).
- SAVE BUTTON SWEEP (logged 2026-07-12 after Phil's third correction, see the save button spec in standing rules): convert every remaining bare `<form action={serverAction}>` with a void action to the useActionState pattern (solid btn-primary, instant "Saving…", "Saved" on success, visible errors, update-count checked so RLS no-ops surface). Known offenders at logging time: app/(app)/founder/page.tsx (setCompanyStatus x3), app/(app)/settings/users/page.tsx (resend/revoke invite), app/(app)/people/[id]/page.tsx (applyMissingChecks, updateTracker x2, transferPerson, assignSupervisor, setEmploymentStatus, setArchived), app/(app)/service-users/[id]/page.tsx (applyMissingChecks, transferServiceUser, assignServiceUserSupervisor, setServiceStatus, setArchived). Canonical implementations: components/settings/branch-form.tsx, components/people/edit-person-form.tsx. Each converted action must return ActionState, never void.

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

Logged from Phase 4 (Service Users). FULLY BUILT + typecheck clean (tsc --noEmit, sandbox) 2026-07-10; next build must run on Phil's machine. Migrations 0027 + 0028 applied to ref bgrtcvyjuwopunpnudeu only. DB smoke test (service role) verified: SU RAG views compute (overdue -> red rollup), tracker auto-creates on SU insert, cascade delete cleans up. Run TEST-CHECKLIST-PHASE4.md as a popup checklist once deployed.

Still to test cold (Phase 4, needs deploy + extra roles/tenants):
- The full TEST-CHECKLIST-PHASE4.md end to end on the deployed build (add a Service User, checks auto-applied from package start, complete a Care Plan Review -> immutable Evidence -> New Review Due advances + Most Recent Review stamped + booking cleared, next-due maths live, RAG rollups, Status pill moves between Main/Hospital/Respite/Cancelled with the "Moved to X" toast, cancelled excluded from active register/dashboard/summary).
- Review workflow auto-derivation live: Review Status = Overdue when New Review Due has passed; Booked In when a Planned Review Date is set and not overdue; Awaiting Review otherwise. Includes the Planned Review Date booking cell (date + reviewer -> Booked In) and Clear.
- The Planned Review Date reviewer calendar-invite EMAIL (.ics) is DEFERRED to Phase 6; test the booking -> email -> add-to-calendar flow when that ships (Phil: "remember to come back and test").
- GDPR read audit: opening a Service User record writes a service_user.viewed audit row (special category); evidence view/download audit lands with the Phase 8 signed-URL export path.
- Permission matrix live for Service Users: Manager (branch register), assigned Supervisor/user (caseload only via service_user_assignments), Team Member sees NO Service User data unless explicitly assigned. Needs a Manager, a Supervisor and a Team Member in Thistle.
- Cross-tenant RLS on service_users/service_user_trackers/service_user_assignments/check_instances(service_user)/evidence(service_user) with two companies.
- SU check config edit (Settings > Service Users) reschedules uncompleted SU instances from package start date via the shared updateCheckDefinition (must NOT null out SU dues — the People join path was branched on population; verify).
- People register regression after the shared-primitive extraction (pill dropdowns: Status/RTW limits/Probation status; the permanent horizontal scrollbar) still behave exactly as before, since register-matrix.tsx now imports components/register/pill-select + horizontal-scrollbar.

Logged from the Phase 3 test run (2026-07-09, TEST-CHECKLIST-PHASE3.md, 31 pass / 2 fail / 10 not tested). Cold items to test later: #14 completed form produces a branded PDF in the private evidence bucket (pdf_sha256); #19 DBS/RTW/Probation tracker Record cards open the correct forms; #23 RTW expiry sets the RTW column and DBS sets DBS/Enhanced DBS; #30 RAG colour thresholds (red past due / amber within window / green else); #36-39 permission matrix (Manager branch-only, Supervisor caseload-only, Team Member read-only + blocked complete route + no SU data, Supervisor evidence scoped to caseload) — needs a Manager, Supervisor and Team Member; #40 cross-tenant isolation — needs a second company. Two fails were found and are being fixed in-phase, NOT deferred: Add-person branch auto-fill of manager/supervisors, and Archive (offer only for leavers + make archived viewable). Two feature requests raised during the run (Leavers view, LTS & Mat Leave view) are being built in-phase.

Logged from Holidays & Absence (People extension, 2026-07-11). FULLY BUILT, migration 0041 applied; NOT yet built/deployed (needs Phil's push) and NOT live-tested. Run TEST-CHECKLIST-HOLIDAYS-ABSENCE.md as popups once deployed. Cold items:
- First real compile: sandbox could not run tsc/next build. Watch the Vercel build for type errors in the new files (esp. the client components importing server-action props, and the Row-typed thresholds editor).
- The four forms (holiday_requests, holiday_response, absence_back_office, absence_management_meeting) only seed into NEW companies. To test on an existing company they must be imported first (Additions item). Until then the record/request flows show a "form not available" notice.
- AI policy suggestion: needs ANTHROPIC_API_KEY + ANTHROPIC_MODEL env in Vercel; verify a real PDF policy parses to method + thresholds, missing-env fails closed, and non-PDF is rejected. Formal per-company AI usage metering is deferred to Phase 6 (currently logged to audit only).
- Absence stage/Bradford maths: unit-test lib/absence/logic (occasions-or-days stage triggers, Bradford S^2*D bands, meetingDue when derived stage > last meeting stage, rolling-window boundary).
- Permission matrix live: TM can request holiday + see only own; Manager approves/records for their branch only; Supervisor caseload read; Admin all; cross-tenant isolation on the four new tables. NOTE: the INSERT policies on absence_events/absence_meetings do not include is_platform_admin(), so a Founder recording directly (before manage-as-company exists) would be blocked — add platform_admin to those policies if needed.
- Realtime: absence_events / absence_meetings / holiday_requests are NOT in the supabase_realtime publication, so the views rely on the 10s poll fallback. Add REPLICA IDENTITY FULL + publication membership for sub-second live updates.
- Holiday calendar edge cases: multi-month spans, month boundaries, Monday-first grid, timezone (dates are civil YYYY-MM-DD string-compared, no TZ shift).
- TM<->Person link: holiday requests attach person_id via people.profile_id when present; confirm a TM's approved holiday shows in their Person drill-down.

Logged from Phase 7 (Billing & tiers, 2026-07-12). FULLY BUILT, migration 0056 applied to ref bgrtcvyjuwopunpnudeu only (company_billing + stripe_events + billing_usage_runs, RLS on all three, select-only policies, service-role writes). NOT yet built/deployed (Phil pushes; the Vercel build is the first compile — `stripe` is a new dependency, so `npm install` must run before commit) and NOT tested (needs Stripe test-mode setup). New code: lib/stripe/{client,config}.ts, lib/billing/{tier,stripe-sync,actions}.ts, components/billing/billing-actions.tsx, app/(app)/settings/billing/page.tsx, app/api/webhooks/stripe/route.ts, app/api/cron/stripe-usage/route.ts. Edits: welcome/actions.ts (seat sync on accept), settings/page.tsx (Billing tile + View billing), founder/page.tsx (status + MRR), settings/forms/page.tsx (form_builder gate), absence/settings-actions.ts (ai_features gate), notifications/data.ts + daily-digest cron (sms_reminders gate), vercel.json (stripe-usage cron), .env.example. Run TEST-CHECKLIST-PHASE7.md as popups once deployed + Stripe set up. Cold items:
- First real compile: sandbox cannot build (npm registry blocked, stripe not installed). Watch the Vercel build for type errors in the new Stripe files (the webhook casts around subscription.current_period_end / invoice.subscription, and the checkout line_items typing).
- Stripe test-mode setup gates ALL Phase 7 testing: products + prices (Business £49 / Pro £99 / Enterprise £199 base, one £5/seat price), STRIPE_SECRET_KEY (sk_test_), price ID envs, webhook endpoint + STRIPE_WEBHOOK_SECRET, all in Vercel with a redeploy after each change.
- Only Thistle (Enterprise) exists, so seat metering (5th user starts billing, removal stops it, proration, idempotency), Business/Pro form-builder + SMS gating, AI gating on non-Enterprise, and Diamond/Black variants all need test companies at those tiers.
- DIAMOND PER-UNIT CUSTOMER RATE is an OPEN pricing decision (env STRIPE_DIAMOND_SMS_PENCE / STRIPE_DIAMOND_AI_PENCE, default = metered cost pass-through). Confirm with Phil (popup) before the first LIVE Diamond invoice.
- reporting_exports is a Pro+ feature but the export screens are Phase 8: wire and test that gate when Phase 8 lands.
- Single-session was VERIFIED present (login claims the session; requireUser signs stale sessions out to /login?reason=signed-out-elsewhere with the clear message), not rebuilt. The live cross-device sign-out test remains as logged from Phase 1.
- Webhook idempotency: replaying an event id must not double-apply (stripe_events claim-then-settle); a failed handler returns 500 so Stripe retries and reprocesses safely (handlers are idempotent).

TESTED LIVE 2026-07-12 (Stripe TEST mode, Thistle, driven in Chrome + verified in DB/Stripe): PASSED billing page + config, Checkout at correct price, subscribe -> active (checkout.session.completed + subscription.created + invoice.paid all processed), Customer Portal (customer, card, invoice £199 Paid), the FIXED SEAT RULE both directions (5th user -> £5 line + seat_quantity 1 via two subscription.updated; disable/delete -> seat_quantity 0), cancel (subscription.deleted -> canceled), form-builder gating (Business locked / Pro unlocked, via a temporary tier flip reverted to enterprise), and Diamond/Black billing displays. Gotcha fixed during testing: STRIPE_PRICE_* env were product NAMES not price_ IDs; code surfaced it visibly ("No such price"), corrected + redeployed. Full log in TEST-CHECKLIST-PHASE7.md. STILL COLD (need Stripe CLI / test clock / second device, cannot run from the agent environment): E1 webhook bad-signature 400; E2 fail-closed 503 (code-verified); E4 invoice.payment_failed -> past_due; F3/F4 Diamond usage cron real invoice (also confirm the Diamond per-unit rate first); A4 AI + SMS gating live; G1 single-session cross-device.

Logged from Phase 8 (Reporting, exports & audit trail, 2026-07-13). FULLY BUILT, migration 0058 applied to ref bgrtcvyjuwopunpnudeu only. NOT yet deployed (Phil pushes; Vercel build is the first full compile; no new npm dependency this phase) and NOT live tested. tsc --noEmit was run in the sandbox during the build. Run TEST-CHECKLIST-PHASE8.md as popups once deployed. CLEARED by this phase (verify during the run): "evidence PDF generated on demand", "5-minute signed-URL download audit-logged", "GDPR read audit" (service_user.viewed on open + evidence.downloaded), and the "SAVE BUTTON SWEEP". Cold items still to test on the deployed build:
- Signed URL 5 minute expiry (A3): needs a real wait or a clock.
- Business tier gating + the single evidence exception (A4, B5, C6): needs a Business tier company or a temporary tier flip on Thistle (revert after), since only Thistle (Enterprise) exists.
- Evidence pack + reports exclude leavers/archived/discharged, and RAG summaries match the registers (C1 to C4, G3): confirm live with real records.
- Cross tenant export isolation (G1): needs a second company (a user of A cannot export B's reports/evidence/audit).
- Team Member / Supervisor isolation (G2): no Reports nav, /reports redirects, record History tab empty for non managers, needs those roles in Thistle.
- Per record History tab uses the record_audit_trail RPC (guarded by can_manage_person / can_manage_service_user): Supervisors do NOT get the History tab by design; revisit if Phil wants caseload supervisors to see it.
- Founder cross company audit console (/founder/audit) and company audit log filters (actor, area, dates) live.
- Delete user dialog (F5): styled dialog replaces window.confirm; a human click may be needed since automation cannot drive a native dialog (this is why it was replaced).

Logged from Briefings (Team Member logins increment 2, 2026-07-26).

TESTED LIVE 2026-07-26, PASSED END TO END, verified in the database rather than by screenshot: Phil uploaded "Test Policy" (Mobile Phones and Social Media) through Settings > Policies, sent it as a briefing to Charlotte test, and she READ AND SIGNED it from her own Team Member login at 23:22 London. Confirmed in SQL: assignment completed, evidence frozen with the policy title and version 1 stamped by the server, a DRAWN signature stored as a PNG evidence file (kind 'signature'), author Charlotte test. So the whole DocuSign-style path (upload, send, open the document by signed URL, sign on screen, Evidence, certificate) works on real data with a real person on a real device.

NOTHING IS SIGNED ON PAPER OR IN ANOTHER APP (Phil checked explicitly: "are we issuing a pdf that they need an app for to sign it becasue that is not what i want"). The uploaded PDF is reading material; the signature is captured in our own UI and the certificate is ours. Every email about a briefing says so in words, and policy documents must NOT carry signature or tick-box lines on the page.

BRIEFING EMAILS were MISSING and are now built (same day, after Phil reported "briefing emails not sending"): briefing_sent on send, briefing_chase per person per day for anything due today or late, briefing_outstanding to Managers and Admins for OVERDUE only. All three claim a notification_log dedupe key first, ride the existing 07:00 daily-digest cron for the two chases, and respect emailDigestEnabled. Two gotchas fixed in the same pass: Resend rate limits REQUESTS not recipients, so a whole-company send now goes through ONE /emails/batch call (sendEmailBatch, falls back to one at a time); and isSendableAddress blocks RFC 2606 demo domains, because 18 of Acme's 41 people are @example.com and bulk-bouncing them would damage the sending domain. The send panel counts with the same function so the count on screen matches what actually sends.

AUDIENCE: "Who is it for?" is now Everyone / A whole branch / Chosen people, and Everyone and A whole branch are resolved SERVER SIDE from the register (never from hidden inputs), so RLS still decides reach and a Branch Manager's "everyone" is their branch. Branch-level issuing exists because local authorities differ.

Cold items still to test on the deployed build:
- briefing_sent live: re-send the test policy to Charlotte (her first one is completed, so a re-send creates a fresh briefing) and confirm the email arrives with a working "Open my briefings" button.
- briefing_chase live: send one WITH a due date of today or earlier, then use the Vercel Run button on the daily-digest cron (or ?force=1 with the secret) and confirm exactly one email per person, and that a second Run sends nothing (dedupe).
- briefing_outstanding live: same run, with something overdue, and confirm a Manager only sees their own branch's people and an Admin sees all. A Manager with no branch must get nothing.
- Demo-address guard: send to Everyone on Acme and confirm the result line reports the 18 example.com people as not emailed, notification_log has no rows for them, and only real addresses receive. Note "AA AA" carries testytesy@gmtest.com, which is not a reserved domain and WILL bounce: clear it or delete that person before a whole-company send.
- Certificate PDF from the signature Charlotte has already given (open it from her completed briefing) and the audit row policy.certificate_downloaded.
- The 'ask' reassign mode still behaves as 'never' until its confirm step is built.

Logged from mobile policy signing (2026-07-26, same day as Briefings). NEW DEPENDENCY: `pdfjs-dist@4.10.38` (first front end dependency added since stripe; Phil approved by popup).

WHY: Phil, "rember, mot peple will us their phone to log into the tm portal", and "how do docusign do it and adobe". Two buttons (Read the policy / Sign it) and a PDF in an iframe are both wrong on a phone: iOS Safari renders only the first page inside a page, and the document was never in front of them while they signed. DocuSign and Adobe render the pages themselves, fill the screen with the document, and keep ONE sticky bar at the bottom whose label is the state. We now do the same: full screen reader (components/staff/policy-reader.tsx, a canvas per page), sticky bar, and a signing sheet over the document. The tick and signature still go through the shared FormRenderer, validator and acknowledgePolicy action, so the Evidence is unchanged.

PHIL'S RULING: the Sign bar stays LOCKED until an IntersectionObserver sees the LAST page ("how do you know they read it" deserves better than a tick box). A one page policy unlocks immediately, and a document pdf.js cannot render unlocks too, so nobody is ever trapped.

THREE THINGS FIXED IN THE SAME PASS:
- SIGNATURE PAD BUG, app-wide: the canvas is a fixed 480x160 internally but stretches to its container, and the pointer handler used raw CSS pixels, so on every phone the ink landed up and left of the finger. point() now scales by canvas.width/rect.width. Affected EVERY signature field, not just policies. Charlotte's 2026-07-26 signature predates the fix and may look skewed.
- app/api/policies/[id]/file is now a PROXY, not a redirect: it streams the bytes from our own origin, so pdf.js never makes a cross-origin fetch at the mercy of bucket CORS and the signed URL never reaches the browser. Still audited as policy.opened.
- pdf.js LEGACY build on purpose (modern needs Promise.withResolvers, absent on iOS 16), worker bundled with new URL(..., import.meta.url) rather than a CDN, dynamic import inside useEffect so it never evaluates during SSR or the build.

Cold items:
- ON A REAL IPHONE (the only test that matters here): the pages render, pinch zoom works, the bar unlocks only at the last page, the signature lands under the finger, and the finished certificate shows a clean signature.
- Multi page and larger policies (the current test document is one page, which unlocks instantly, so the scroll gate is NOT yet proven).
- An old Android and an iPad.
- A non PDF policy (.doc/.docx are accepted at upload): pdf.js cannot render those, so confirm the failure path unlocks the bar and the new-tab link works. Consider rejecting anything but PDF at upload.

Logged from the policy signing round (2026-07-27, overnight continuation of Briefings). NEW DEPENDENCY: `pdf-lib@1.17.1` (Phil approved by popup), alongside pdfjs-dist from the night before.

THE CERTIFICATE IS GONE, REPLACED BY THE SIGNED COPY. Phil: "instead of a certificate showing them they signed something, why dont we just generate the pdf of the document they signed, with the date, time and signature?" Correct, and better evidence: a certificate that merely NAMES a document leaves an inspector holding two files and taking your word they belong together. `/api/assignments/[id]/certificate` now streams the ORIGINAL DOCUMENT with one signature page appended (name, date and time in London, version, drawn or typed signature, reference), built with pdf-lib and rendered on demand from frozen Evidence. It fetches the file for the VERSION THEY SIGNED out of company_policy_versions, so a later edit can never rewrite what a past signature shows. lib/assignments/certificate.tsx was deleted (moved to _to_delete beside the repo, because device_bash cannot rm on the mounted iCloud folder). Buttons now read "Signed copy".

POLICIES CAN BE WRITTEN OR PASTED (0136) and SIGNING RULES ARE PER POLICY (0137) — see the memory files; both are live and deployed.

READ GATE, FIXED TWICE IN ONE NIGHT, and worth remembering as a pattern:
- v1 watched a sentinel at the foot of the document with an IntersectionObserver. Wrong twice: the panel keeps React state when closed and reopened, so one unlock lasted the whole session, and with pdf.js the pages render progressively so "the bottom" arrived while later pages were still blank.
- v2 measured the panel's own scrollTop, but measured it on the first frame, when the content had not laid out and scrollHeight == clientHeight, so it concluded "nothing to scroll" and unlocked instantly. Phil spotted it as "i cant see a % bar" — the bar only rendered while locked, so its ABSENCE was the symptom.
- v3 (live, verified by Phil): ignore a container under 40px, require the layout to settle (600ms) AND the document to be fully rendered before trusting a short measurement, reset on every open, and ALWAYS show the progress bar (amber filling, green when unlocked). Replayed through eight states in a scratch script before shipping.
LESSON: a gate that can only be observed by its own absence is untestable. Show the state.

SENTENCE CASE HEADINGS: the paste parser only treated a line as a heading if half its words were capitalised, so "1. Purpose" became a heading and "2. Who it applies to" did not. Care policies head sections in sentence case; the test is now length plus the absence of sentence punctuation. Checked against the real pasted policy (11 cases).

TM PORTAL: "Policies I have signed" and "Forms I have sent in" are now matching COLLAPSED sections (components/staff/my-section.tsx), same heading, count, chevron and glass rows. What is still to do stays open.

Cold items:
- The signed copy on a REAL signature: open one and confirm the appended page shows the drawn signature in dark ink (signatures given before the ink fix are white on transparent and will look blank).
- The signed copy for a WRITTEN policy (the appended page goes onto our generated PDF) and for a .doc/.docx upload (pdf-lib cannot parse it, so it falls back to a standalone signature page — another reason to restrict uploads to PDF).
- Multi page scroll gate on a real phone, and the same on an older Android.
- Editing a written policy to v2 and confirming the reassign rule, plus that the v1 signed copy still shows v1 wording.
- briefing_chase and briefing_outstanding on the 07:00 cron (still only briefing_sent has been proven live).

Logged from the Briefings follow-ons (2026-07-27, migration 0138). Phil confirmed the deploy green.

PASSED LIVE, verified in the database not just on screen:
- Grouped Completed list + the live "who has signed" report.
- The daily chases: notification_log shows briefing_chase to the Team Member and briefing_outstanding to both Admins, all status 'sent', fired by the 07:00 cron at 06:02 UTC on 2026-07-27. briefing_sent had already passed the night before.

BUILT THIS ROUND (all four of the outstanding Briefings items):
1. NO INVITE MAY GO TO A DEMO ADDRESS. isSendableAddress now guards createAndSendInvite and resendStaffInviteByEmail, i.e. the single door every invite passes through, rather than the four callers. A demo row is a SKIP, not a failure: inviteStaffForPerson returns skipped:'demo_email' and the importer reports "N had a demo address so were not emailed". This was the only item that could embarrass us in front of a real customer: importing a spreadsheet with sample rows still in it would have posted dozens of bouncing invitations on day one.
2. POLICIES ARE PDF ONLY. Accept attributes narrowed and a server-side pdfOnly() check on both upload paths. A Word file cannot be rendered by the phone reader nor stamped by pdf-lib, so accepting one produced a policy nobody could read and a "signed copy" that was only a signature page.
3. "ASK ME EACH TIME" IS REAL. It behaved exactly like 'never' because the asking half was never built. Saving a version under that mode now reports how many people hold the old wording, and reassignPolicyToEveryone (a proper confirmed action, also available under 'never') does what 'always' does automatically. The three REASSIGN_MODE_LABELS were rewritten, because the old wording promised behaviour the code did not have.
4. STANDING POLICIES FOR NEW STARTERS (0138): company_policies.assign_to_new_starters, a tickbox per policy, honoured by BOTH "add a person" and the importer through lib/assignments/new-starters.ts (service-role, deduplicated, best effort). DEFAULT FALSE and false for every existing policy, because it silently sends documents to people. Closes the gap that quietly ruins a compliance record: policies reaching whoever existed the day they were sent, with every later hire invisibly exempt.

BUILD REVIEW CAUGHT TWO OF MY OWN BUGS before the push (a subagent read every changed file): a stray `assign_to_new_starters: newStarterFlag(formData)` inside rememberSigningDefaults, where formData is not in scope AND policy_config has no such column (red build, plus it would have silently stopped the remembered defaults saving); and the same flag never being persisted by uploadPolicy, so the tickbox was decorative on the upload path. Worth repeating the method: review the diff for compile errors before spending a deploy.

MOVED TO FINAL TESTING (Phil, 2026-07-27, "add the rest to the final testing phase") — everything below is Briefings and still cold:
- Send to Everyone on Acme: exactly 3 real emails, 18 example.com people skipped and reported. Clear testytesy@gmtest.com off "AA AA" first: not a reserved domain, so the guard will not catch it and it WILL bounce.
- A whole-branch send, and that a Branch Manager's "Everyone" resolves to their branch only.
- A written policy edited to version 2: reassignment behaviour, and that the v1 signed copy still shows v1 wording.
- Withdraw, and re-sending something somebody already holds open (skip, never duplicate).
- Permissions: a Supervisor sees no Briefings at all; a Team Member sees only their own.
- The pdf.js reader on an older Android and on an iPad.
- The four items built this round: a demo-address import, a rejected .docx upload, the ask-me-each-time flow end to end, and a new starter (added AND imported) receiving a policy ticked for new starters.


RETURN TO WORK v3, AI WRITTEN QUESTIONS (added 2026-07-28, migration 0147, not run live):
- Absence > Return to Work > Record. Before pressing anything, confirm the form shows "Questions asked and answers" as an empty box in Prepared for you, and that the old fixed questions (seen a doctor, fit note, medication, appointments, anything at work making it worse, what support would help) are GONE.
- Press Draft it for me. Confirm a "Questions to ask" block appears with 4 to 6 questions, each its own control, and that the box called Questions asked and answers disappears while they are on screen.
- Confirm the questions actually differ between two different absences: a long absence with a stated reason and someone with a run of short ones should not get the same list. This is the whole point of the change.
- Answer every type that appears: type into a text one, press Yes and then No on a Yes/No one, choose and then change an option on a choice one. Leave one unanswered on purpose.
- Save the interview, open the Evidence record, and confirm the answers read back as Q and A blocks on separate lines, in the order they were asked, with the unanswered one showing its question and an empty answer.
- Download the Evidence PDF and confirm the same blocks are on separate lines there too.
- Draft it for me TWICE in one sitting and confirm the second set of questions replaces the first cleanly and the answers reset.
- Complete a Return to Work WITHOUT pressing Draft it for me, typing into Questions asked and answers by hand, and confirm it saves and reads back normally.
- Tick "completed over the phone" after drafting and confirm the signature swap still works with the question block on screen.
- Confirm Interview conducted by still lists your staff and still saves: 0147 published a brand new version, so the staff options had to be re-baked into it.
- A stress test worth doing once: temporarily point the draft at an absence with no reason and no history and confirm you still get a usable draft rather than an error.

EVIDENCE SIGNATURES ON SCREEN AND IN THE PDF (added 2026-07-29, not run live):
- Record a Return to Work, tick "This interview was completed over the phone", sign the interviewer box and save. Open the Evidence record and confirm the signature is DRAWN on screen with "Signature captured" under it, not "Not provided".
- Download the PDF for that same record and confirm it says "Signature captured" for the same field, and that the label wraps between words with no broken word such as "conversa tion".
- Confirm the page does NOT show "Employee signature" at all on that phone record, and that the PDF does not either. The two must list exactly the same fields.
- Record a second one WITHOUT ticking the phone box, sign as the employee, and confirm the mirror image: employee signature drawn on screen and in the PDF, interviewer signature absent from both.
- Open an OLD Return to Work recorded before today and confirm it still opens against its own older version and its signature now shows rather than reading "Not provided".
- Sign a policy (Assignments), open that Evidence, and confirm the signature still appears as a "View signature" link that opens the stored image. That path stores a real file and must be unchanged.
- Complete any Check that captures a signature and confirm the same behaviour there, since the fix is generic and not specific to Return to Work.
- Open an Evidence record with a single select answer and confirm the page now shows the option LABEL, matching the PDF.

RETURN TO WORK v4, THE WHOLE CONVERSATION IS DRAFTED (added 2026-07-29, migration 0148, not run live):
- Absence > Return to Work > Record. Before pressing anything, confirm "The conversation" section is GONE along with fit to return, ongoing symptoms, was it work related and adjustments needed, and that "Support agreed" has gone from Support and next steps.
- Confirm the remaining sections read: Prepared for you, The absence, Next steps (Referral made and Follow up date only), Confirmation.
- Press Draft it for me. Confirm 5 to 8 questions appear, and that between them they ask about fitness to return, adjustments, whether anything at work played a part, and what support would help, in words written for THAT absence rather than the old fixed wording.
- Do the same on a very different absence (a run of single days against one long absence with a stated reason) and confirm the questions genuinely differ while still covering those four.
- Confirm no question diagnoses, speculates about a cause, or suggests an outcome or disciplinary action. If one ever does, that is a stop and report, not a retry.
- Answer every type that appears, leave one unanswered, save, then open the Evidence and confirm the whole set reads back as Q and A blocks on separate lines, and the same in the PDF.
- Complete one WITHOUT pressing Draft it for me and confirm the help text under Questions asked and answers tells you what to cover, and that it saves.
- Confirm Interview conducted by still lists your staff and still saves: 0148 published a brand new version, so the staff options had to be re-baked into it.
- Open a Return to Work recorded YESTERDAY against v3 and confirm it still shows its old conversation answers, unchanged.
- Confirm Referral made and Follow up date still save and read back, on screen and in the PDF.

INVITE EMAIL DOMAIN ALLOWLIST (added 2026-07-29, migration 0149, none of this has been run live):
- Settings > Users with NO domains set. Confirm the new "Allowed email domains" card says any email address can be invited, then invite somebody at gmail.com and confirm it sends exactly as before. Nothing about an existing company may change until a domain is added.
- Add "@SunriseCare.CO.UK " with the @ and the capitals and a trailing space. Confirm it saves as sunrisecare.co.uk, the button flashes green and reverts, and the box clears.
- Try to add each of these and confirm each is refused with its own reason and nothing is saved: an empty box, "sunrise care.co.uk", "alex@sunrisecare.co.uk", ".sunrisecare.co.uk", "sunrisecare.co.uk.", "sunrisecare", and "co.uk".
- Add the same domain twice and confirm the second attempt says it is already on the list.
- With the domain set, invite alex@gmail.com from the invite form. Confirm it is REFUSED, that the message names @sunrisecare.co.uk, and that no invite row and no email are created.
- Invite alex@sunrisecare.co.uk and confirm it sends normally.
- Invite alex@mail.sunrisecare.co.uk and confirm it is ACCEPTED, since subdomains count.
- Invite alex@sunrisecare.co.uk.example.com and confirm it is REFUSED, since the match is on a dot boundary.
- Add a second domain and confirm the refusal message now names both, worded as "@a or @b".
- THE ONE THAT MATTERS MOST. With the allowlist set, add a Person with a gmail.com address and confirm their Team Member login invite still sends. Then bulk import a spreadsheet of people on personal addresses and confirm every one of them is still invited. If either is blocked the feature is wrong, not the data.
- Also confirm Resend and Revoke on a pending invite still work with a list set, including on an invite created before the list existed.
- Remove the last domain and confirm the card returns to "No domains set" and a gmail.com invite sends again.
- Confirm a Manager or Supervisor cannot reach Settings > Users at all, and check the Audit log shows company.invite_domains_updated for each add and remove.

TRIAL REQUESTS (added 2026-07-29, migration 0151, none of this has been run live):
- Open the founder console. Confirm the new Trial requests tile appears above Companies and reads "Nothing waiting" while there are no new requests.
- Submit a real Start free trial on the marketing site with every field filled, including a phone number and a message. Confirm the founder email still arrives exactly as before AND the applicant still gets their acknowledgement. Neither may change.
- Reload the founder console. Confirm the tile now carries an amber "1 new" pill and says one request is waiting.
- Open Trial requests. Confirm the request is there, newest first, with the company, the contact, the email, the phone, the tier, the team size, the message, where it came from and the time it arrived in London time, and that Last moved reads "Not worked yet".
- Press the email address and confirm it opens a mail composer to the right address. Press the phone number and confirm it dials.
- Submit a second request leaving the phone, tier, team size and message blank. Confirm the page shows "Not given" and "Not sure yet" rather than blanks, and does not break.
- Change a status to Contacted and press Save. Confirm the button says Saving, flashes green, then reverts to Save and is NOT left stuck green, the pill changes, and Last moved now names you and the time.
- Type a note, save, reload the page, and confirm the note is still there. Then edit only the note and confirm Last moved does NOT change, since only a status move stamps it.
- Set one to Provisioned. Confirm NO company is created anywhere: check Companies before and after. Setup stays founder led.
- Set one to Declined, then back to New, and confirm the tile count on the console goes back up.
- THE INJECTION CHECK. Submit a trial request with a company name of <img src=x onerror=alert(1)> and a message containing <script>alert(1)</script> and a bogus email such as javascript:alert(1)@x. Confirm the page prints all of it as visible text, no dialog appears, nothing is styled by it, and the bogus address is shown as plain text with no link.
- THE PERMISSION CHECK. Sign in as a Company Admin and go to /founder/trial-requests directly. Confirm you are turned away by the same guard as every other founder page, and that the same happens for a Manager and a Team Member.
- Check the founder Audit console shows trial_request.status_changed for each move with the old and new status in it, and that the entry appears with no company against it and does NOT appear in any company's own audit log.

PUBLIC MARKETING PAGES (added 2026-07-29, not run live):
- Load / on a phone and confirm the headline, subhead, both buttons and the price line are all visible without scrolling, and that the headline does not wrap to five lines.
- Confirm the hero product preview still renders and the trust row reads CQC, CIW, PQS returns and audit trail.
- Scroll the homepage and confirm there is no longer a spreadsheet problem band immediately followed by a near identical differentiator band.
- Load /pricing and confirm the h1 shows £49 or £69, the table headers both read "per month, plus VAT", and the "How the pricing works" section shows four cards.
- Confirm the pricing page bottom section has ONE button and that the hello@becarecompliant.com link opens a mail client.
- Tab through the pricing and comparison tables with a screen reader on and confirm each row announces its label before the values.
- Load /start-trial?tier=pro and confirm Pro is preselected in the dropdown and the option reads "Pro, £69 a month plus VAT".
- Submit the trial form with only company, name and email filled and confirm it succeeds, the founder notification arrives and a row lands in trial_requests.
- Submit with the honeypot filled by hand in dev tools and confirm it silently succeeds and writes NO row.
- Submit with the email field blank and confirm the browser blocks it, then with a malformed email and confirm the action's own error shows.
- Confirm the success panel shows the action's message plus the new line about a person reading every request.
- Read every marketing page once looking for a dash of any kind in customer facing copy, and for the words "item" or "board".

TRIAL PROVISIONING, FOUNDER APPROVED (item 4c, DESIGN AGREED with Phil 2026-07-29, migration 0152 APPLIED, no application code yet):

THE DECISION. A stranger never creates a tenant. Somebody requests a trial exactly as they do
today, the request lands on the 0151 trial requests screen carrying flags for anything already
seen, and the founder presses Provision once. The system then does the lot: company, Office and
first Branch, all five seed catalogues, the Company Admin invite, and the 14 day clock started at
the press rather than at the request, so a Friday night enquiry does not lose two days.

Phil rejected an earlier draft of mine that would have let a verified stranger provision
themselves. His version is better and it deleted a whole layer of work: NO pending signup table,
NO hashed verification token, NO public provisioning route, and NO service role surface at all.
The Company Admin invite email IS the proof the address is real, because a fake one never accepts.
It also means the five seed_company_* functions are untouched: an earlier draft would have had to
loosen the is_platform_admin() guard on all five, which is exactly the sort of change that goes
wrong quietly.

It also means the marketing copy stops being a problem. The homepage FAQ already says we set the
trial up for you, usually the same working day, and under this design that stays TRUE.

THE RULES, as agreed:
- One trial per email address, for ever, until Phil clears the field.
- One trial per COMPANY domain. NOT per personal domain. gmail, outlook, icloud, btinternet and
  the rest fall back to the one per address rule, because otherwise the first applicant on gmail
  would block every applicant on gmail afterwards, and small UK providers use personal addresses
  constantly. Enforced by writing NULL into trial_owner_domain for a personal provider, so the
  partial unique index simply does not constrain it.
- Same email or same company domain BLOCKS the Provision button, with a Provision anyway override
  that asks for a reason and writes it to the audit log. A similar company name or a repeated
  phone number WARNS only: only a person can tell a genuine second service in a group from
  somebody having another go.
- Company name matching is a normalised key, no new extension. Sunrise Care Ltd, sunrise care and
  Sunrise Care Services Limited all key to "sunrise".
- The no touch public route is dropped. Revisit later with an auto approve switch that provisions
  only the requests where NO flag fired.

MIGRATION 0152, APPLIED 2026-07-29 to bgrtcvyjuwopunpnudeu:
- public.company_name_key(text), immutable, the ONE definition of a comparable company name, used
  by a stored generated name_key column on BOTH companies and trial_requests. TypeScript must
  never re-implement it, it compares keys the database produced. This is the Evidence page versus
  Evidence PDF lesson applied before it could bite.
- companies: trial_started_at, trial_ends_at, trial_owner_email, trial_owner_domain,
  provisioned_by (founder or trial_request), name_key, plus partial unique indexes on the email
  and the domain. Verified after applying: Acme has trial_ends_at NULL, so no company that
  existed before 0152 can ever be caught by the trial gate.
- trial_requests: company_id linking a request to what it became, name_key, and indexes on
  name_key, lower(email) and phone for the flag lookups.
- public.provision_company(...) returns jsonb. SECURITY DEFINER, guarded on its first line by
  is_platform_admin(), execute revoked from public and anon. Does company, both branches and all
  five seeds in ONE transaction, so a seed failure rolls the whole company back and Phil simply
  presses again. Today's createCompany can leave a half seeded company behind for ever and only
  mentions it in a note. It re-checks the duplicate rules itself, because a screen check is for
  the founder to READ and must never be the thing that actually holds.
- WARNING for any future caller: the two trial indexes are PARTIAL, and a partial unique index
  cannot be used by ON CONFLICT (42P10). Select, filter, insert.

STILL TO BUILD for 4c: the Seen before panel and the Provision button on the trial requests
screen; the trial lapse gate (banner from three days left, then Company Admin to Settings >
Billing and everyone else to a Trial ended page, plus a matching guard on the tenant API routes,
which bypass layouts entirely); and the Pro price fix below.

BLOCKER, CONFIRMED BY PHIL 2026-07-29. Stripe pricing was never changed when the tiers changed.
Stripe still holds Business £49, Pro £99, Enterprise £199 while the public pricing page promises
Pro at £69. So today a Company Admin pressing Subscribe on Pro is charged £99 against a public
promise of £69. That is the actual charge, not a display bug, and nobody has hit it only because
nobody has subscribed. TIER_BASE_PENCE agrees with Stripe at 9900, so Settings > Billing also
tells a Pro customer £99 and the founder MRR figures are inflated by £30 per Pro company. Stripe
Prices are immutable: this needs a NEW £69 recurring GBP Price on the Pro product, STRIPE_PRICE_PRO
repointed in Vercel, the £5 seat, £7.50 branch and £10 AI top up prices confirmed at the same
time, then TIER_BASE_PENCE.pro to 6900. MUST land before any trial is provisioned that could
convert.

PROVISION FROM A TRIAL REQUEST (BUILT 2026-07-29, migrations 0152 and 0153, none of it run live):

What was built: lib/founder/trial-matching.ts (personal email provider list, trial domain,
phone normalisation, match types), a Seen before panel and a Provision form on
/founder/trial-requests, and provisionFromTrialRequest in the founder actions. The page
comment that used to say "IT PROVISIONS NOTHING" has been rewritten, because it now does.

0153 fixed TWO defects in 0152, both caught by reviewing the diff before building, both in
the same two lines of provision_company:
- The override could never have worked. 0152 skipped its own duplicate checks when a reason
  was supplied, but the two partial unique indexes are unconditional and the insert still
  claimed the email and the domain, so Provision anyway would have hit 23505 and rolled the
  whole company back with a constraint name on screen. An override now does not RE-CLAIM the
  keys: the first company keeps ownership, so a third attempt is still blocked. The index is
  not weakened.
- Typing 0 in the trial days box voided the one trial per address rule. Ownership was only
  written "when v_days > 0", so a 0 day provision recorded nothing and the same address could
  take a full trial on a second company later with no block and no flag. Ownership records
  WHO the company was granted to, not whether a clock is running, so it no longer depends on
  the days. Only trial_started_at and trial_ends_at do.
Verified after applying 0153: provision_company is still owner postgres, security definer,
with execute on authenticated and service_role only, no anon and no PUBLIC.

- Open Founder > Trial requests. Confirm the page still lists every request exactly as it did,
  and that a request with nothing matching shows NO Seen before panel at all. A flag on that
  screen has to mean something, so silence is the correct state for a clean request.
- Submit a fresh trial request from the website with a company email such as ann@sunrisecare.co.uk.
  Confirm it appears with no flags, then press Provision with the tier left as it came in.
- Confirm the button says Provisioning, and that you land on the new company's founder page.
- On that company confirm: the Office and the first Branch both exist, the starter Forms are
  there, the People checks and Service User checks are configured, the training courses are
  there, and the tier is what you chose.
- Check the company row carries a trial: trial_ends_at is 14 days out, trial_owner_email is the
  applicant and trial_owner_domain is sunrisecare.co.uk.
- Confirm the applicant received a Company Admin invitation, and that accepting it lands them in
  their own company with nothing of Acme's visible.
- Go back to Trial requests. Confirm the request now reads Provisioned as <company> with the
  trial end date, that the Provision form has GONE from that request, and that the founder
  console waiting count has dropped.
- THE ONE PER ADDRESS RULE. Submit a second request from the same address for a different
  company name. Confirm the panel shows a red Blocks row naming the company that already holds
  it, that Open it goes to that company, and that the button now reads Provision anyway with a
  reason box that will not submit empty.
- Press it with a reason. Confirm you are asked to confirm first, ONCE, and that pressing Cancel
  does nothing at all and does not ask again.
- Confirm the second company IS created, and that it has trial_owner_email and
  trial_owner_domain NULL while the first company still holds both. Then submit a THIRD request
  from the same address and confirm it is still blocked, naming the first company.
- Check the founder Audit console shows company.created against the new company AND
  trial_request.provisioned with no company against it, and that the override reason appears in
  the second one.
- THE ONE PER DOMAIN RULE. Submit a request from a DIFFERENT person at sunrisecare.co.uk and
  confirm it is blocked with the domain reason, naming the company.
- THE GMAIL CASE, THE ONE THAT MATTERS MOST. Provision a company from a gmail.com address.
  Confirm the company row has trial_owner_domain NULL. Then submit a request from a COMPLETELY
  DIFFERENT gmail.com address and confirm it is NOT blocked and shows no domain flag. If a
  second gmail applicant is ever blocked, the feature is wrong.
- Confirm a repeat of the same gmail address IS still blocked, since the address rule still
  applies.
- THE NAME LOOKALIKE. Submit a request called "Sunrise Care Services Limited". Confirm it shows
  an amber Check row saying the name looks like an existing company, and that it does NOT block.
- THE PHONE LOOKALIKE. Submit two requests with the same number typed differently, once as
  07700 900123 and once as +44 7700 900123, and confirm the second flags the first.
- Try a slug that is already taken and confirm you are told so in plain words and NO company is
  created. Try a company name made only of stripped words, such as "Care Ltd", and confirm it
  still provisions and does not flag every other company.
- THE ROLLBACK. If a provision ever fails part way, confirm NO company row is left behind:
  0152 does the company, both branches and all five seeds in one transaction.
- THE PERMISSION CHECK. As a Company Admin, a Manager and a Team Member, confirm
  /founder/trial-requests is still refused by the same guard as every other founder page.
- Confirm the existing Status and Notes form on each request still saves exactly as before, with
  the button flashing green for about two seconds and reverting, never staying green.

THE TRIAL LAPSE GATE (BUILT 2026-07-29, no migration, none of it run live):

What was built: lib/billing/trial.ts (pure, with lib/billing/trial.test.ts, 8 tests, all
passing along with the other 21), lib/billing/trial-gate.ts (the database half, deduped per
request with React cache), the lock inside requireCompany, an amber warning bar in the app
layout from three days out, and /trial-ended.

THE LOCK IS ONE LINE IN ONE FUNCTION, and that is the point. Every page, every server action
and all nineteen tenant export routes reach their company through requireCompany, so none of
them had to remember anything and a new route gates itself. Two callers opt out with
allowLapsed: the Trial ended page (or it would loop) and the two billing actions (or the way
out of a lapsed trial would be behind the lock it exists to clear). The founder is checked
BEFORE the lock, so managing as a lapsed company still works, which is exactly when he needs
it most.

THE GATE READS ONE COLUMN, companies.trial_ends_at, and never company_billing. company_billing
RLS admits only a Company Admin and the founder, so a gate that read the subscription would
have locked a MANAGER out of a company his Admin could use perfectly well. Instead the Stripe
webhook clears trial_ends_at the moment a subscription goes active, so a paying company reads
exactly like one that never had a trial. Everyone in the company sees the same answer.

- Set a THROWAWAY company's trial_ends_at to yesterday in SQL. Never Acme, and never a company
  you are signed into as the founder without checking first.
- Sign in as that company's Company Admin. Confirm you land on Trial ended, that it names the
  company and the date, that it says nothing has been deleted, and that Add a card and carry on
  opens Stripe checkout.
- Confirm every other route bounces there too: type /dashboard, /people, /service-users,
  /reports and /settings straight into the address bar.
- Confirm the export routes are closed as well, since they bypass the layout: /api/reports/register
  and /api/evidence/<id>/pdf.
- Sign in as a Manager, a Supervisor, a Viewer and a Team Member of the same company. Confirm
  each one sees Trial ended with the "ask your administrator" wording and NO Subscribe button.
- THE MANAGER CHECK THAT MATTERS. Subscribe the company for real in Stripe test mode. Confirm
  the Admin gets straight back in, THEN confirm the MANAGER does too. If the Manager is still
  locked out while the Admin is not, the gate is reading the subscription instead of the column.
- Confirm companies.trial_ends_at is NULL after the webhook, and that trial_started_at and
  trial_owner_email are still there, so the history of the trial survives.
- Set trial_ends_at to two days out. Confirm the amber bar appears on every page reading
  "2 days left", that an Admin sees the Add a card link and a Team Member does not, and that
  the app still works normally.
- Set it to four days out and confirm the bar is GONE. The warning starts at three days, and
  a bar that is always there is a bar nobody reads.
- Set it to a few hours out and confirm it reads "1 day left", never "0 days left".
- Confirm the founder can still Manage as the lapsed company and move around inside it.
- Confirm a company with trial_ends_at NULL, which is every company that existed before 0152
  including Acme, is completely unaffected throughout.
- Confirm a Black or Diamond company is never locked even if a trial date is somehow set.

THE PRICE GUARD, AND THE £69 PRO PRICE (BUILT 2026-07-29, Stripe price created, env var NOT yet switched):

THE BUG. The pricing page said Pro was £69. TIER_BASE_PENCE said 9900. Stripe held a £99
price created on 13 July. Phil confirmed Stripe was never touched when the tiers were re-cut,
so the first customer ever to press Subscribe would have been charged £30 a month more than
the website promised them, and the trial lapse gate makes Subscribe the way OUT of a lapsed
trial, which is the worst possible moment to overcharge somebody.

WHAT WAS DONE. A new £69.00 GBP monthly price was created on the Be Care Compliant Pro
product in Stripe (sandbox "Test Bill 2", acct_1TfLB1RhL0XqZmTg):
  product prod_UsGyAdP70lgEFP
  NEW price price_1TyYNLRhL0XqZmTgSwyF3uqm   £69.00 per month, GBP, flat rate
  OLD price price_1TsWQoRhL0XqZmTgJcqpbPAg   £99.00 per month, still the default, 0 subs
TIER_BASE_PENCE.pro is now 6900. STRIPE_PRICE_PRO in Vercel STILL POINTS AT THE £99 PRICE
until Phil changes it, which is why the guard below matters right now rather than in theory.

THREE PLACES HOLD A PRICE AND NONE OF THEM COULD SEE EACH OTHER. Now two of them are tested
and the third is checked at runtime:
- lib/billing/price-consistency.test.ts fails the build if the public pricing page and the
  code disagree on any plan price, the £5 seat, the £7.50 branch or the £10 AI top up. It
  caught the Pro bug the moment it was written.
- lib/billing/price-check.ts asks STRIPE what each configured price actually is. It powers a
  new Billing prices panel on the founder health screen, and checkoutPriceProblem() refuses
  a sale outright when Stripe disagrees with the app, rather than charging an amount the
  customer was never shown. It fails CLOSED on a proven mismatch and OPEN on a failure to
  read, so a Stripe outage cannot stand between a customer and their account.
- AI_TOPUP_PENCE is now a constant rather than a number in a comment, and
  STRIPE_PRICE_AI_TOPUP was missing from .env.example entirely.

- Open Founder > Health BEFORE changing the env var. Confirm the new Billing prices panel
  shows Pro as WRONG, naming £99 against £69, and that the header pill is red.
- Press Subscribe as a Pro company and confirm you are REFUSED with the plain English
  message, that nothing is charged, and that no Stripe Checkout page opens.
- Change STRIPE_PRICE_PRO in Vercel to price_1TyYNLRhL0XqZmTgSwyF3uqm and redeploy. Confirm
  the health panel turns green for Pro and that Subscribe then opens Checkout showing £69.
- Confirm a company INSIDE its included users can subscribe even if the seat price is ever
  wrong, since no seat line goes on their invoice. Then confirm a company with extra users
  IS refused while the seat price is wrong.
- Confirm Enterprise reads "Not sold" in neutral rather than red, because it is not on the
  pricing page. A panel that is permanently red is a panel nobody reads.
- ONLY AFTER the env var is switched, archive the £99 price in Stripe. Archiving it before
  would break Checkout, and the health panel would then say the price is archived.

STRIPE IS A SANDBOX. The dashboard says Sandbox, the account is "Test Bill 2" with an
"Exit sandbox" button and a "Verify your business" banner, and one account holds the products
for all three businesses (Join Care Now, Carer Academy, Be Care Compliant). So the £69 price
exists in the SANDBOX only. Before launch, confirm which account and mode the production keys
point at, and if there is a real live account the whole BCC product and price set has to be
created there too. Worth knowing either way: if the account is not verified, BCC cannot take
real money yet at all.

MARKETING COPY AGAINST THE NEW TRIAL (checked 2026-07-29):

Read the homepage, pricing and start trial pages against what the product now actually does.
Clean on the standing rules: no dash of any kind anywhere in customer facing copy, and no use
of "item" or "board". The "we set the trial up for you, usually the same working day" promise
stays TRUE under founder approved provisioning, so it did not need rewriting after all.

ONE REAL GAP, NOW FIXED. Nothing on the site said what happens when a trial ENDS, and as of
today it ends in a hard lock. A customer losing access on day fifteen having read only "nothing
starts billing on its own" would have been entitled to feel misled. The homepage FAQ and the
pricing page now say the account PAUSES rather than charging, that nothing is deleted, and that
adding a card puts it back. It is also the better sales line: no surprise charge.

- Read the homepage FAQ answer and the pricing "VAT and the trial" card and confirm both now
  describe the pause, and that neither contains a dash.
- Confirm the wording matches what the app actually does: a warning bar from three days out, a
  Trial ended page after that, and access restored by the webhook the moment a card is added.

STILL OPEN, NOT A COPY BUG. The pricing footnote promises "extra branches are £7.50 each per
month". EXTRA_BRANCH_PENCE exists but is used for DISPLAY ONLY on Settings > Billing: there is
no Stripe price for a branch and nothing ever charges for one. Undercharging rather than
overcharging, so nobody is harmed, but it is money not collected and the copy implies it is.

MARKETING PASS PART ONE (BUILT AND PUSHED 2026-07-29, commit 9ced9d7, none of it seen live):

Four of the eleven findings from the design and copy review, plus one thrown in:
- A PRIVACY NOTICE at /privacy, linked from the footer and from under the trial form, with
  /privacy added to PUBLIC_PATHS. Until now the site collected a name, an email and a phone
  number from a stranger, promised "we use these details only to set your trial up", and gave
  them nothing to check it against. For a product whose whole pitch is handling special
  category health data properly, that was the weakest signal on the site.
- The tab title said the brand TWICE on Pricing and Start trial. The root layout template is
  "%s . Be Care Compliant" and a template applies to CHILD segments only, which is why the
  homepage escaped it while both child pages also appended "| Be Care Compliant".
- The start trial h1 now says REQUEST, matching the button, which sends a request. The nav and
  homepage buttons still say Start free trial: that is the invitation, this is the transaction.
- The trial form was promising three details and showing seven controls, four of them tagged
  optional. The three required fields now stand alone and the rest sit inside a details
  disclosure that opens itself when a plan arrived in the query string from the pricing page.
- Every empty field gained a placeholder, because the filled input style made an empty required
  box look already completed. "Work email" became "Email": personal addresses are accepted by
  design and the old label put off exactly the smallest buyers.

THE REVIEW FOUND ONE REAL DEFECT, and it was in the privacy notice rather than the code. The
page claimed compliance evidence "is anonymised" after eight years. It is not.
lib/evidence/retention.ts holds DEFAULT_RETENTION_MIN_YEARS, computeRetentionUntil,
backfillRetentionForRecord and anonymiseEvidence, and NOTHING CALLS ANY OF THEM: evidence
.retention_until is never populated and there is no retention cron in vercel.json. The sentence
now says only what is true today. The gap itself is on the list as its own item.

Everything else in the notice was corroborated against the code before it went out: five minute
signed URLs on private buckets with every download audited, per company separation in RLS rather
than an application filter, an audit_log with a select policy and no insert, update or delete
policies, the eu-west-2 Supabase project with Vercel pinned to lhr1, the supplier list, and no
analytics or advertising cookies anywhere in the dependencies or the root layout.

- Load /privacy signed OUT, in a private window. This is the one that can fail: the page is new
  and only reachable because /privacy was added to PUBLIC_PATHS. If it bounces to the login
  screen, that is why.
- Confirm the Privacy link appears in the footer of every marketing page, and under the trial
  form, and that both reach the same page.
- Read the whole notice once as if you were a registered manager checking us out. Two things are
  NOT settled and must be before launch: there is no controller identity on it, because the
  company is not incorporated, and the AI supplier is the one transfer that leaves the UK and
  Europe. It has not been near a solicitor.
- Check the tab titles on Pricing and Start trial read once, not twice.
- Submit a real trial request from the rebuilt form with ONLY the three required fields, and
  confirm it still arrives, still emails you, and still lands in trial_requests.
- Submit another with every optional field filled from inside the disclosure, and confirm all of
  it arrives. The fields are inside a closed details element, which still submits, but this is
  the check that proves it.
- Open /start-trial?tier=pro and confirm the disclosure is ALREADY OPEN with Pro preselected.
  Open /start-trial with no query and confirm it is closed.
- Confirm the honeypot still silently succeeds and writes no row.

MARKETING PASS PART TWO (BUILT 2026-07-29, not yet run live). Item 4b is now COMPLETE except
for one thing that needs Phil: a real quote for the social proof band.

- THE TRUST ROW moved above the product preview. CQC, CIW, PQS returns and audit trail were
  sitting under a tall screenshot, which pushed them clean off the first screen, and they are
  the reason a registered manager keeps reading.
- THE SPREADSHEET ARGUMENT IS NOW MADE ONCE. The "Built for care, not bent into shape" band
  used to set up the same fight the comparison table then wins properly. Its intro now
  describes what the product is and leaves the comparison to the table. The three cards were
  KEPT rather than deleted: cutting a whole section is Phil's call, not mine, and the option
  is still open.
- THE REVEAL NO LONGER SHOWS GHOST TEXT. It waited until 12 percent of a section was already
  8 percent inside the screen, then faded for six tenths of a second from fully transparent,
  so normal scrolling caught whole sections unreadable. It now arms a fifth of a screen EARLY
  (threshold 0, positive bottom rootMargin) and fades in 0.4s.
- A "IF YOU EVER LEAVE" CARD on pricing. The one objection every compliance buyer has and
  nobody was answering. It is true and provable now, so it belongs on the page. That section
  now shows FIVE cards, not four, which changes an older test line.

THE ACCESSIBILITY PASS, AND I WAS WRONG ABOUT THE HEADLINE FINDING. I had said the muted body
text was around or under the AA threshold. It is not. Measured against the real palette
(navy-950 #081231, navy-900 #0d1d4b, navy-800 #14306b), white at 55 percent scores 4.91 to
6.08 and passes AA for normal text on all three, and white at 75 percent scores 7.75 to 10.55.
Gold #f59e0b on navy is 5.87 to 7.55, and navy on the gold button is 8.57. The comparison table
was also already fine: it carries role="img" with Yes and No labels plus proper column and row
header scoping, so my point about colour carrying meaning alone was wrong too, and reduced
motion was already handled in globals.css.

What was actually wrong, and is now fixed:
- The ONLY text failing AA was white/40 and white/45 inside the two decorative product mockups
  (product-preview and pqs-report-preview), at 3.31 to 4.48. Raised to white/55.
- NO MAIN LANDMARK on any marketing page, so a screen reader user had no way to jump past the
  navigation. All four pages now wrap their content in <main id="content">.
- NO VISIBLE FOCUS RING ON LINKS. Buttons and inputs had a gold ring; links fell back to
  whatever the browser draws, which is easy to lose on this navy, and the marketing site is
  navigated almost entirely by link. Added a:focus-visible with the same gold ring.

Verified before commit: the repo's own TypeScript ran clean (tsc --noEmit, exit 0), and the JSX
of all four pages was walked independently to confirm the inserted main tags open and close at
the same depth.

- Load each marketing page and confirm nothing has moved that should not have. The hero should
  now read headline, subhead, buttons, price line, TRUST ROW, then the product preview.
- Scroll the homepage at normal speed and confirm you never catch a section faded out.
- Tab through the homepage with the keyboard and confirm every link shows a gold ring.
- Confirm the pricing explainer section now shows five cards and reads correctly at desktop
  and mobile widths, since five cards in a two column grid leaves the last one alone on its row.
- STILL OPEN, NEEDS PHIL: the social proof band is still a placeholder. An empty testimonial
  section reads worse than none. One real quote, even from your own service, or take it out.
- STILL OPEN, OPTIONAL: a skip link. The main landmark gives screen reader users the jump, but
  nothing yet links to #content.

POSITIONING AND SECURITY ON THE HOMEPAGE (BUILT 2026-07-29, not yet run live):

Phil brought a Lead Product Designer brief. Four parts of it were adopted; the rest was NOT,
and the reasons are worth keeping because they will come back:
- The brief made the homepage's one job "book demos". Rejected for now. Demo led selling costs
  a hundred pounds or more of founder time per demo and the product is £49 to £69 a month, so
  it takes most of a year to pay back one demo. Vanta is demo led because Vanta is ten thousand
  a year; Stripe, Linear and Notion, the brief's other reference points, are all self serve.
  The founder approved trial we built today is already a qualified lead.
- The brief claimed FOUR regulators including Care Inspectorate Scotland and RQIA Northern
  Ireland. The product is CQC and CIW only. Putting all four on the site would have been the
  third public claim in one day that the code does not keep.
- The brief made "Compliance Score" the flagship. The app ALREADY scores, through Inspection
  Readiness and the PQS score, so that is two scores with no stated relationship. Also risky:
  a provider showing 98 percent who is then rated Requires Improvement will hold that number
  against us.
- The brief specifies a LIGHT theme (#F8FAFC background, white cards) and slightly wrong hexes
  (#0D1B4C against the real #0D1D4B, #F5A623 against the real #F59E0B). That is a rebuild of
  every screen including the app, not a polish, and two nearly identical hexes are worse than
  two obviously different ones.

WHAT WAS ADOPTED:
- THE POSITION NOW LEADS. The h1 is "The operating system for care compliance." The old h1,
  "see every check that is overdue before your inspector does", was the specific hook and it is
  NOT lost: it now opens the supporting paragraph, where it still does its work. The eyebrow
  pill carries the regulators, which is what a registered manager scans for. This is the
  pattern every reference point uses: the position in the h1, the promise underneath.
- CONFIDENCE RATHER THAN SOFTWARE, in two headings. "Everything a registered manager needs"
  became "Know where you stand, every day". "Find out what is overdue in your service" became
  "Walk into your next inspection knowing". The buyer is not shopping for features, they are
  trying not to be the person who got a Requires Improvement.
- A SECURITY SECTION, immediately before pricing, because it is the last objection a compliance
  buyer raises before they look at the number. Four cards: separation enforced in the database
  rather than by a filter in the software, an audit trail with no way to edit or delete,
  held in the UK with role limited access, and files served only by links that expire in five
  minutes. Every line was corroborated against the code before it was written, and it links to
  the privacy notice for the detail.
- The tone rules needed nothing: the existing copy already avoids the clichés the brief warns
  about.

Verified before commit: the repo's own TypeScript ran clean (tsc --noEmit, exit 0) and the JSX
was walked to confirm the new section sits inside main, between the social proof band and
pricing.

- Load the homepage and read the hero out loud. Confirm the position reads as a claim rather
  than a slogan, and that the overdue checks hook still lands in the paragraph underneath.
- Confirm the eyebrow pill now names CQC and CIW and nothing else. Scotland and Northern
  Ireland must not appear anywhere until the frameworks exist.
- Scroll to the Security section and check every one of the four claims is one you would be
  happy to defend in front of a customer's governance meeting. If any of them ever stops being
  true in the code, that card comes off the page the same day.
- Confirm the privacy notice link from that section works.
- Read the two reworded headings and decide whether they sound like you. They are the one
  judgement call in this batch.

THE HERO (BUILT 2026-07-29, not yet run live):

- DEAD SPACE. The hero opened with pt-28, which is 112px of nothing under a sticky 80px header,
  so the first thing on the page was a gap rather than a claim. Halved to pt-10 sm:pt-14.
  Generous top space is a premium signal only while there is something above the fold to be
  generous about.
- "Local authority PQS returns" in the trust row became "LIVE PQS SCORING" (Phil). Stronger and
  still true: the measures are scored from current data every time the report is opened, and
  Satisfaction feeds User Experience Q2 from the last six months of plan review answers. The
  only thing it gives up is the words "local authority", which were quietly explaining what PQS
  is for, and sitting next to CQC and CIW it survives that.
- THE PRODUCT PREVIEW WAS REBUILT. It was a four by four table of names and pills, and it had
  three problems. It read as a SPREADSHEET on a site whose central argument is that spreadsheets
  are the enemy. It showed only the People register, so the two register model, the thing no
  general tool does, was invisible. And it showed one screen while the headline now claims an
  operating system. The matrix stayed and the application was put around it: company level
  figures across the top (Overdue, Due in 14 days, On the registers), both registers as tabs
  with People active, and the branch the view is scoped to. Status now visibly rolls up from one
  check on one carer, to a branch, to the company, which is the thing a spreadsheet cannot do.
  The job titles were in the data all along and never rendered; they are now, which makes it
  read as a staff record rather than a row.
- EVERYTHING IN IT EXISTS IN THE PRODUCT. Overdue and Due in 14 days are real dashboard cards,
  the registers, the branch scope and the RAG cells are real. Same rule as the Security section.
- IT IS NOW aria-hidden. The names and dates are invented, so a screen reader reading them out
  as though they were real records is worse than silence, and the copy around it already says
  what the product does.
- A TRAP AVOIDED, worth remembering: the stat figures were first written with text-rag-red and
  text-rag-amber. Those theme colours are #dc2626 and #b45309, the LIGHT theme pill inks, and
  they go muddy on navy. Dark surfaces in this app use text-red-300 and text-amber-300.

Verified: the repo's own TypeScript ran clean, tsc --noEmit exit 0.

- Load the homepage and confirm the gap under the top bar is gone without the hero feeling
  cramped, at desktop and on a phone.
- Confirm the h1 puts "care compliance." on its own line at every width.
- Look at the preview and confirm it reads as an application rather than a spreadsheet, that
  both register tabs are visible, and that the three figures across the top are legible against
  the navy rather than muddy.
- Confirm the trust row reads CQC in England, CIW in Wales, Live PQS scoring, Audit trail on
  every record.

DASHBOARD REDESIGN, INCREMENT 1 (BUILT 2026-07-29, not yet run live):

Phil produced a Mission Control dashboard mockup. Three decisions were taken before any code:
- THE COMPLIANCE SCORE IS INSPECTION READINESS RENAMED, not a second number. One score, and
  "View score breakdown" opens the readiness report where every point of it is attributed to
  real checks. Two company wide percentages that can contradict each other is how a compliance
  product loses an argument with a regulator.
- ONLY WHAT IS ALREADY REAL gets built. The mockup's Upcoming inspections and Incidents tiles
  have no data behind them at all (there is no incidents feature and nothing records a
  scheduled inspection), and Risk level would be invented. They are NOT built.
- GOLD STAYS THE ACCENT. Green means compliant, amber due soon, red overdue. The mockup led
  with green as a brand colour, which would have made green mean two different things.

BUILT: the top of the screen as ONE block. Score dial on the left, four figures beside it
(People overdue, Service users overdue, Due in 14 days, Mandatory training), then the Inspection
readiness bars full width underneath. Page widened from max-w-5xl to max-w-7xl.

FIRST ATTEMPT WAS WRONG AND PHIL WAS RIGHT TO SAY SO. It bolted a strip onto the old dashboard
and left the old three card strips stacked underneath, so it read as two designs on one page.
It also printed RAW DATABASE KEYS as the readiness labels (wellbeing, care_support) because it
used req.keyArea instead of req.title, and it left a stranded full width training slab that
appears in no mockup. All three fixed. Lesson: when the ask is a redesign, replacing the layout
IS the job; an additive strip is not a smaller version of it, it is a different and worse thing.

The two old register strips now appear ONLY when there is no score, so a company without
readiness, or a role that must not see it, still gets a full dashboard.

CORRECTION TO SOMETHING I TOLD PHIL: I said nothing in the product stores history, so trends
were impossible. Wrong. framework_readiness_snapshots (0111) stores a score per requirement
per day, so the score's movement is real. The other tiles' trends still are not.

THE REVIEW FOUND SEVEN DEFECTS, and two would have put a wrong number on screen:
1. THE REGULATOR DEFAULT WAS BACKWARDS. Everywhere else in the codebase defaults
   (regulator ?? "ciw"); the dashboard defaulted to cqc. companies.regulator is nullable and
   nothing in the app ever writes it, so the dashboard would have scored against a DIFFERENT
   framework from the report its own link opens, and would never have matched a snapshot code,
   silently killing the trend for ever. Fixed.
2. THE DELTA COULD INVENT MOVEMENT. Readiness is computed through RLS, so a Branch Manager's
   live score covers their branch, while the snapshot is written by whoever last opened the
   readiness page, possibly company wide. Subtracting one from the other prints movement that
   never happened. The delta is now drawn ONLY for company wide roles, only when every
   requirement has a previous score, only when they all came from the SAME day, and only when
   that day is within a week.
3. "SINCE YESTERDAY" WAS A LIE. Snapshots are written when somebody OPENS the readiness page,
   so the last one can be weeks old. The line now names the actual date it measures from.
4. A SUPERVISOR WOULD HAVE SEEN A PARTIAL SCORE presented as the company's, with two links to
   a page that bounces them straight back. Both new reads are now gated on a company wide role.
5. Percentage rounding: the training figure is stored to one decimal and read "86.7%" next to a
   whole number dial. Rounded.
6. The "Measured from today" line could appear under "Not scored". Gone.
7. Left as its own list item, see below.

TWO THINGS DELIBERATELY NOT FIXED HERE, both now on the list:
- TRAINING IS INVISIBLE TO THE REGISTERED ROLES. training_courses_select allows only
  platform admin, is_company_admin (role = company_admin) and is_company_manager (role =
  manager). Neither covers registered_individual or registered_manager, so a Registered
  Manager sees NO training courses at all, on the dashboard AND on the Training page. That is
  a pre-existing RLS gap, needs a migration, and is the same class as 0150.
- getTrainingCompletion builds the ENTIRE training matrix to read one percentage: for a 60
  person service that is up to 900 rows over the wire, thrown away. It also has no .range(),
  so above PostgREST's 1000 row default the number would silently understate. Needs a counting
  RPC.

- Sign in as Acme's Company Admin and confirm the score dial shows, that the number matches the
  one on /readiness EXACTLY, and that View score breakdown goes there.
- Confirm the readiness bars match the same report, and that a requirement with nothing mapped
  reads n/a rather than 0%.
- Open /readiness, come back tomorrow, and confirm the delta names a real date rather than
  saying yesterday.
- Sign in as a SUPERVISOR and confirm there is no score, no bars and no training card.
- Sign in as a Branch Manager and confirm they see a score with NO delta line.
- Sign in as a company WITHOUT framework_enabled and confirm the whole section is absent and the
  dashboard looks exactly as it did before.
- Sign in as a Registered Manager and confirm the training card is missing, which is the RLS gap
  above rather than a bug in this work.

## Phase 12 — Marketing & Launch

Marketing site on becarecompliant.com, onboarding collateral, subscription agreement (no data selling clause), launch.

### 2026-07-29 PQS panel: stable order, whole tile is the link

- The PQS lines changed places between page loads. Cause: `check_definitions` was read with no
  ORDER BY, so Postgres returned the starred rows in whatever order it liked, and those rows are
  concatenated ahead of the fixed appended measures. Fixed at both ends: the query now orders by
  name then id, and `getPqsMeasures` sorts the whole list into the Cardiff return order
  (Quality Compliance Q1 to Q3, Safeguarding Q1, User Experience Q1 and Q2, Supplier Performance
  Q2) with an unrecognised measure sorting to the end by name.
- The "View full report" link is gone from the panel corner. The whole tile is now the link to
  `/reports/view/on-time`. `Panel` takes `linkLabel={null}` for this. Only safe on a panel with
  no links inside it, because an anchor inside an anchor is invalid HTML.

### 2026-07-29 Compliance calendar: five working day columns

- Was "the next five dates that happen to have something due", drawn as five bordered boxes. Now
  it is the next five WORKING days starting today (Monday when today is a weekend), one column
  each, divided by hairlines instead of boxed. Empty days still draw their column and read
  "Clear", so the week keeps its shape.
- Weekend due dates are carried onto the following working day rather than dropped. Bank holidays
  are not modelled, matching `addBusinessOrCalendarDays` in Complaints. The panel footer says so.
- `CalendarDay.items` is now `{ name, count }[]` instead of a list of names, so a column can say
  "3 Supervision" rather than repeating the name. Sorted by count then name. Four lines per
  column, then "+N more".

### 2026-07-29 AI compliance insights removed

- The red "AI compliance insights" tile is deleted. Expiring soon moved into that slot. Both were
  `lg:col-span-3`, so it is a straight swap and no other tile changed shape or size.
- Row two is now PQS report (5), On call (4), Expiring soon (3). Row three is Compliance calendar
  (5) and Recent activity (4), so it runs 9 of 12 wide with the last three columns empty. That is
  deliberate: nothing else was resized.

### 2026-07-29 Bottom row lines up with the row above it

- Compliance calendar is now `lg:col-span-4 lg:col-start-6`, the same four columns On call
  occupies, so it sits directly under it. Recent activity is `lg:col-span-3`, the same three
  Expiring soon occupies, which puts it bottom right. The five columns under the PQS report are
  intentionally empty.

### 2026-07-29 Bottom row fits on the screen

- Recent activity is a bounded scroll area (`max-h-[124px]`), so the newest lines are always on
  screen and the older ones are a scroll away instead of off the bottom of the page. Line size
  dropped to 13px with tighter leading, since these summaries often wrap.
- Compliance calendar shows three lines per day column instead of four, then "+N more", and the
  footnote is one shorter line at 10px. Both changes are height, not width: the tile still sits in
  the four columns under On call.

### 2026-07-29 Compliance calendar becomes the Planner

- The tile is now called **Planner** and shows THIS user's planner: the tasks they are booked to
  conduct, read through `listMyBookings`, the same rows the Planner page reads. It is no longer a
  company wide feed of everything falling due.
- `getComplianceCalendar` and the `CalendarDay` type are deleted. `getPlannerWeek(userId)`
  replaces them: five working day columns, always five, planned bookings only, sorted by start
  time with untimed bookings after.
- A booking that really falls on a Saturday or Sunday shows on the next working day carrying its
  real day as a hint ("Sat 09:00"), so nothing is hidden and no date is misstated.
- Each day column scrolls (`max-h-[88px]`) rather than truncating to "+N more", so a busy day is
  never hiding work you cannot reach. Recent activity beside it already scrolls the same way.
- Gated properly: the tile is drawn only for a role that has a planner and only when the Planner
  feature is on. `PLANNER_ROLES` now lives in `lib/planner/data.ts` and the Planner page guards on
  the same constant, so the page and the tile cannot drift apart on who has a planner.

### 2026-07-29 PQS report fills the left hand column

- Rows two and three are now ONE twelve column grid. The PQS report is `lg:col-span-5
  lg:row-span-2`, so it runs the full height of both rows down the left. On call and Expiring soon
  sit beside it on the top row, the Planner and Recent activity on the bottom row. Nothing else
  changed width or position.
- `Panel`'s body is `flex-1 min-h-0` so a tall panel can spread its content. The PQS measures are
  a flex column with `justify-between`, which distributes the seven rows down the card instead of
  leaving a pool of dead space under them. Bars went from 8px to 10px now there is room.
- The no data state spans both rows too, so an empty PQS panel leaves the same shape.

### 2026-07-29 White PQS score tiles

- A strip of white tiles sits at the top of the PQS panel, above the measure list. Each tile is
  one scope and lists every measure that scope scores, with the rate coloured by the same
  thresholds as the bars below (85 green, 50 amber, under 50 red).
- One branch shows ONE tile carrying the branch name, because the branch figures and the company
  figures are the same numbers. Two branches shows three tiles: Company, then each branch. The
  strip scrolls sideways rather than squeezing, so four or more branches simply scroll.
- White is deliberate, so the tiles lift off the navy. That forces the LIGHT theme rag inks
  (`rag-green`, `rag-amber`, `rag-red`): the dark surface variants used everywhere else on this
  page would be unreadable on white.
- COST: each branch scope is a full run of the PQS engine. They run in parallel, and the company
  measures the panel already computed are passed in rather than recomputed, so a single branch
  company costs nothing extra. A company with several branches will feel this on dashboard load
  and is the first candidate for caching.

### 2026-07-29 Score tiles go two by two and the bar list is deleted

- The white tiles are a two column grid, so four scopes read two on top and two underneath rather
  than a sideways scroll. More than four and the grid scrolls vertically inside the panel; the
  tiles never shrink.
- The bar list under them is GONE. It printed the same seven measures as the Company tile, so the
  panel was saying everything twice. The white tiles are the report now.
- One footnote line remains, because the panel is a whole card link and needs to say so.
- Each line carries the PQS SCORE (the band Cardiff awards: 0, 2, 5, 7 or 10) to the RIGHT of the
  rate, in navy (Phil, 2026-07-30). The measure name takes the slack so both number columns pin to
  the right edge and read as columns down the tile, rather than drifting with the label length.

### 2026-07-30 PQS cycles now roll forward (a real scoring defect, fixed)

WHAT WAS WRONG. `computeOnTime` took ONE due date per anchor. A record that had never had the
check done therefore owed exactly one cycle, at start date plus the interval, and if that single
date fell outside the six month window the record vanished from the measure entirely.

PROVEN AGAINST LIVE DATA (Acme Care Company, project bgrtcvyjuwopunpnudeu, 30 Jul 2026):

- Caerphilly: 13 of 14 staff had NEVER been supervised. 11 started before Nov 2025, so their one
  due date fell outside the window and was dropped. Nothing counted, so the tile read "n/a,
  nothing was due" for the branch doing the least.
- Newport1: 6 never supervised, 4 started recently enough for their one date to land in the
  window, so it read 0%.
- Net effect: the branch doing NOTHING scored better than the branch doing a little, and the
  company figure (Supervision 45.2%) was measured only over records whose single due date
  happened to land in the window. An understatement of non compliance, in the company's favour.

THE FIX.

- The cycle now rolls forward an interval at a time until the check is done or until today.
- Anchors are SORTED. `[start, ...completions]` was not necessarily ascending: a record can carry
  a start date later than evidence already on file (live example, a Caerphilly person with start
  01/08/2026 and supervisions on 19/07/2026), and the walk assumed order.
- The walk is extracted to `lib/export/on-time-cycles.ts`, pure, no runtime imports, with fifteen
  unit tests in `on-time-cycles.test.ts`. It could not be tested inside on-time.ts because that
  module is server-only and talks to Supabase. 49 tests pass.
- A runaway backstop of 50,000 cycles per gap exists so a future bug in the step function cannot
  hang a page. It is unreachable in practice by design: see defect 2 below.
- One computation, so the dashboard tiles, the report and the PDF all move together.

THREE DEFECTS IN THE FIRST CUT OF THE FIX, caught by review before it shipped:

1. Sorting `[start, ...completions]` together let the START DATE act as the settlement of the
   cycle before it, crediting an on time completion and printing a completion date no evidence
   supports. Anchors are now built by `buildAnchors`: the origin, then completions only.
2. The 400 cycle cap kept the OLDEST 400 and dropped the recent ones, which recreated the very
   bug being fixed for any long running short interval check (a weekly check anchored in 2015
   stopped generating in 2022 and vanished from a 2026 window). Cycles before the window start
   are now discarded as they are generated, and the cap is a runaway backstop only.
3. A cycle due TODAY was counted as late. It has until the end of the day. Back to a strict
   comparison, as the code it replaced had.

Also deduped: two evidence rows on the same day used to raise the same due date twice, one of
them credited on time.

EXPECT THE NUMBERS TO GET WORSE. That is the point: Caerphilly Supervision goes from n/a to 0%
with a real denominator, and the company figure drops.

### 2026-07-30 Score and rate share one ink

- The PQS score on a white tile now carries the SAME rag colour as the rate beside it, instead of
  navy (Phil). The rag decision is made once per line and used by both numbers, so they can never
  contradict each other.

### 2026-07-30 The Compliance score now measures something

Phil asked how the score could read 85% "Good" while the PQS return was dire. It could because it
was measuring almost nothing. Five fixes, all five asked for.

ROOT CAUSE, found in the schema. 0109 put UNIQUE (company_id, requirement_id, source_kind) on
requirement_evidence_map. A mapped CHECK also carries source_kind = 'check', so a company could
map exactly ONE check per requirement. Acme's Care and Support was evidenced by a single Risk
Assessment and Leadership and Management by a single Annual Appraisal, both definitions long since
switched OFF. Migration 0155 replaces that with a partial unique index over metric rows only.

1. MAPPING (0154, 0155). `seed_requirement_map(company)` builds the default mapping by check key
   for both regulators, is idempotent, backfills every existing company, and is called by
   `provision_company` so a new company is never unmapped. Acme's Care and Support went from one
   dead check to eight, Leadership and Management to five.
2. TRAINING. Mandatory training was pushed into the score as a label with a NULL percentage, so a
   company at 36% could not move its own number. It is a real signal now.
3. UNSCHEDULED. The roll-up dropped every instance with no due date, and a dropped instance can
   only flatter the score: Acme had 66 unscheduled under Care and Support and 117 under Leadership
   and Management. They are counted, excluded from the score, and SHOWN on the dashboard, the
   readiness page and the readiness pack. Instances of switched off definitions no longer count.
4. HISTORY. Each requirement now takes the six month on time completion rate of its OWN mapped
   checks as a further signal, from the SAME engine the PQS report runs, so the two surfaces
   cannot disagree. Keyed by check definition id, not key: `key` is unique per (company,
   population), so a people Audit and a service user Audit share one and would overwrite each
   other.
5. LABEL. "Good / Inspection ready" is a stronger claim than an average of mapped requirements can
   carry. Now "Mostly on track" and "On top of it", with a line saying how many scheduled checks
   the number is measured over and how many are not scheduled at all.

SNAPSHOTS CLEARED (0156). The stored snapshots were produced by the old method, so the delta would
have drawn "down 30 since 29 Jul", reporting a change of measurement as a collapse in performance.
They rebuild from the next readiness page visit.

DEFECTS CAUGHT BY REVIEW BEFORE SHIPPING: the check key collision above; the readiness pack PDF
running the PQS engine twice (a route handler is outside the React tree, so cache() does not
dedupe, the route now computes readiness once and hands it to the narrative); the unscheduled line
being hidden inside the score branch, which concealed it in the one case it exists for; the PQS
band colours disagreeing between the dashboard (10 green, 7 amber, else red) and the PDF (5 was
amber), now the same rule in both; and a mapping row carrying both a check and a metric source
silently losing the metric.

PERFORMANCE. `computeOnTime` is deduped per request with React cache() on primitive arguments, and
companyName is deliberately not part of the key since the computation never reads it.
`getTrainingMatrix` is cached the same way: a dashboard load asked for it three times over.

### 2026-07-30 Incidents tile becomes Complaints

- The red "Incidents (open)" tile is replaced by a live Complaints tile (Phil). There is no
  incidents feature, and there was never going to be a number in that tile.
- The figure is cases NOT closed (open plus in progress), which is what a manager acts on. Red
  when any case is past its response date and the subtitle says how many, amber when there is
  anything open, green when there is nothing. Links to the Complaints register.
- Gated on the SAME role list the Complaints register admits, not just on the feature flag.
  Complaints hold special category data, so RLS would hand a Supervisor an empty set, and an empty
  set rendered as "0 complaints" is a lie by omission. Off the Pro tier it stays a red tile that
  says so.
- Uses the existing `getComplaintCounts`, so the tile and the register cannot disagree.

### 2026-07-30 Risk level becomes Absences, Upcoming inspections becomes Holiday

- **Absences** replaces the red Risk level tile. The figure is meeting invites still to send plus
  Return to Works still to complete: two lists, one job to a manager, so the headline is the total
  and the subtitle splits it. Red when a Return to Work is past its due date. Links to the Absence
  register.
  - `invites` counts people whose absence has tripped a trigger and who do NOT already have a
    meeting booked. An invite that has gone out is not outstanding work, even though the meeting
    has not happened yet.
- **Holiday** replaces the red Upcoming inspections tile, showing requests waiting for a decision.
  Named Holiday, singular, to match the navigation. Links to `/people/holiday`.
- Both read through RLS, so a Branch Manager sees their own branch's queue and nobody else's.
- The red tile list at the top of the file is down to Policies up to date and the date range.

### 2026-07-30 Due in 14 days and Expiring soon become one thing

- They were two boxes answering the same question differently: the tile counted RECORDS over 14
  days under a subtitle that said "checks", and Expiring soon counted CHECKS over 7 and 30 days,
  truncated to five lines. Two windows, two units, nothing a manager could reconcile.
- `getExpiringSoon` is replaced by `getDueSoonByCheck`, which returns the total AND the breakdown
  from one pass. The tile shows the total, the panel lists the lines, and the lines add up to the
  headline. The panel is retitled "Due in 14 days, by check" so it reads as the breakdown it is.
- Lines are split "Within 7 days" then "8 to 14 days", soonest window first whatever the counts,
  because this week matters more than next. All lines are shown, scrolling rather than truncating,
  since a truncated list cannot add up to the total.
- The tile's old figure came from `getComplianceBuckets.due14`, which counts records. That is now
  unused by the dashboard: the subtitle always claimed checks, and now it is telling the truth.
- Overdue work stays out of both, because it is the Open actions tile and counting it twice would
  make the day look worse than it is. The panel footnote says so.

### 2026-07-30 Absences tile carries two figures

- New `SplitTile`: two large numbers spaced apart, each centred over its own caption, "Invites to
  send" and "Return to works due" (Phil).
- One combined headline hid which of the two was actually waiting on you. They are two separate
  jobs and now read as two.
- Each figure carries its own colour. Return to works goes red only when one is past its due date,
  not merely outstanding.

### 2026-07-30 Policies up to date and Due in 14 days become one tile

- The red "Policies up to date" tile is gone and Due in 14 days takes its slot, running down BOTH
  tile rows in the same four columns (Phil). The two tile grids had to become one grid for
  anything to span them; every other tile keeps its width and position, and both rows still add
  to twelve.
- The extra height carries the split: N within 7 days, N in 8 to 14 days, computed from the SAME
  lines the breakdown panel lists, so the split cannot drift from the total.
- NOTE FOR THE LIST: policy signing coverage is still not built, and it is no longer visible
  anywhere on the dashboard. The red tile was the reminder. Item to keep open, not something the
  screen will nag about now.
- The red tile list at the top of the file is down to the date range picker alone.

### 2026-07-30 On call and Due in 14 days swap places

- On call: urgent follow ups moves up into the tile block, taking the four column slot that runs
  down both tile rows. Urgent follow ups belong at the top of the screen.
- Due in 14 days moves down into the panel grid at `lg:col-span-4`, which puts the headline
  directly beside its own "by check" breakdown.
- Widths are unchanged either side of the swap: both were four columns, and both keep their
  content exactly as it was.

### 2026-07-30 On call shows three, so the tiles keep their size

- The panel is two tile rows tall. A fourth urgent row made it taller than those two rows, and
  every tile beside it stretched to match, which is what changed the tile sizes after the swap.
- Capped at three, with a quiet "N more waiting" line when there are others. The corner link is
  the way to the rest.

### 2026-07-30 SMS and AI tiles fill the dead space

- Holiday and Complaints were three columns carrying two columns of content. Both drop to two, and
  an SMS tile and an AI credits tile take the space (Phil). Both rows still total twelve.
- SMS: sent this month, with a segments line only when a message ran to more than one. NO
  "remaining": nothing in the product includes an SMS allowance, so there is nothing to count down
  from, and Phil chose used only rather than inventing a bundle. When bundles exist the tile has
  room for it.
- AI credits: used this month and left, as two figures. Used is ledger spends NET of refunds,
  because runAi hands a credit back when a request fails.
- ADMIN ONLY. `usage_events` and `ai_credit_ledger` are Admin only by RLS. When the caller is not
  an Admin both tiles are skipped AND the four neighbouring tiles keep their original three
  columns, so a Manager sees exactly the layout they saw before rather than a hole.

DEFECTS CAUGHT BY REVIEW BEFORE SHIPPING:

1. `company_ai_credits` is readable by any company MEMBER, not by Admins, so a founder in a manage
   as session cannot read it at all. The tile would have shown a red "0 left" for a company with
   credits. `remaining` is nullable now and renders n/a.
2. The month boundary was `T00:00:00Z` off a London date. In British Summer Time that is 01:00
   London, so the first hour of the month was excluded and the dashboard would have disagreed with
   the Usage page. SMS now reads the `usage_monthly` view, which buckets in London, and the AI
   ledger uses a real London midnight computed from the zone offset.
3. The SMS cost line could never render: nothing writes `cost_pence` for an SMS. Replaced with
   segments, which are real.
4. A failed read was becoming zero spend. Any read error now returns null and the tiles disappear.
5. "Running low" was a flat under 10, which means very different things on Business (25 a month)
   and Black (1000). It is now a quarter of the tier's own grant, read from the same function that
   issues it.

### 2026-07-30 SMS tile is red until sending is wired up

- The SMS tile is a red MissingTile so it reads as a job still to do (Phil), not a finished
  figure. Two things are outstanding: sending is not wired up, and no tier includes an SMS
  allowance to count down from.
- The number in it is REAL metering, so the corner badge says "Not wired" rather than "No data".
  `MissingTile` now takes an optional `value` and `badge` for exactly this case: red because the
  work is unfinished, not red because the figure is missing.
- Back on the red tile list at the top of the dashboard file, which is the standing to do list
  that screen carries.

### 2026-07-30 Top row lines up, numbers get bigger, gaps tighten

- THE MISALIGNMENT: the score card still carried `lg:row-span-2` from when the tiles were two
  separate grid blocks. They are one block now, so the span made the score card a row taller than
  everything beside it. One row each, both stretch, both finish level.
- The tile block is `h-full` with `xl:grid-rows-2`, so the two tile rows split the column evenly
  and fill it instead of sizing to whichever tile happened to have the longest caption.
- FIXED GEOMETRY on all eight tiles: label on one line and truncating, number at a fixed size
  (text-4xl, leading-none) and a caption block with a fixed minimum height. Every number sits at
  the same height and every caption starts at the same height, whatever their length. Slack falls
  at the bottom of the tile, where it does not push apart the two things a manager compares.
  `SplitTile` and `MissingTile` use the same geometry, so a two figure tile and a red tile line up
  with the live ones beside them.
- Gaps tightened from 4 to 3 throughout the page and between the page's blocks.
- On call is back to FOUR: the tile rows are taller now the numbers are, and the gaps are tighter,
  so a fourth row fits inside the height instead of dictating it.

### 2026-07-30 Header buttons and the PQS window dates

- The red "Date range not wired" chip is gone. Every figure on the page is live and nothing was
  ever going to filter by period, so the chip was a promise the screen had no plans to keep. It
  comes off the red list at the top of the file too, which now holds SMS alone.
- "Export report" is now "Reports", because the button opens the Reports page and exports nothing.
- The PQS panel names the ACTUAL days instead of saying "the last six months", e.g. "Completion
  rate 30 Jan 2026 to 30 Jul 2026". Same font, same colour, same line.
- The window comes from `defaultOnTimeWindow`, the same function the report and the PDF use, so
  the three can never name different periods. It is recomputed on every load, so it rolls forward
  daily on its own, and it is deliberately not the user's to change: it is the window Cardiff
  scores.

### 2026-07-30 Dead space out of the tiles and the panels

- Tile numbers up from 36px to 40px, the same size in all eight. 40 rather than 44 because the two
  figure tiles (Absences, AI credits) share their column with the icon, and 44 pushed "133" into
  it. Equal size across the eight is the rule these tiles are built on.
- Captions now sit on the FLOOR of the tile (`mt-auto`, `items-end`), so the slack falls between
  the number and the caption instead of forming a dead band underneath. The last line of a one
  line and a two line caption land on the same baseline, which is what keeps the row reading
  level.
- The SMS caption was a sentence; the badge already says it is not wired, so it is "sent this
  month".
- Score card: `justify-between` rather than `justify-center`, so it fills its height instead of
  leaving a band top and bottom, and the percentage is 44px.
- On call: five, NOT scrollable. The fifth line goes in the space that was empty.
- Recent activity: ten lines instead of six, at 11px with tighter spacing and no scroll.

### 2026-07-30 Three due windows in place of two boxes saying the same thing

- The Due in 14 days tile and its "by check" panel were two boxes answering the same question
  again. Both are replaced by THREE tiles: Due in 7 days, Due in 14 days, Due in 30 days, filling
  the same seven columns (2, 2, 3) beside the PQS report.
- NESTED windows: 30 includes 14, 14 includes 7. That is what "due in 30 days" means to a manager,
  and it matches getComplianceBuckets, which has nested its windows since the start. The captions
  say so instead of leaving it to be worked out.
- `getDueSoonByCheck` is replaced by `getDueSoon`, one pass over both registers returning the three
  counts. Overdue work stays out of all three: that is the Open actions tile.
- Nothing else on the dashboard touched.

### 2026-07-30 Each PQS tile opens its own branch report

- The white tiles inside the PQS panel are individual links to `/reports/view/on-time?branch=<id>`
  (Phil). The panel itself is no longer one big link, because an anchor inside an anchor is
  invalid HTML that the browser silently unnests; the whole card form has been removed from
  `Panel` entirely rather than left as a trap.
- The COMPANY tile does not link. The PQS report is always a single branch by design, so there is
  no company wide report page to send anyone to.
- Caught by review, three defects:
  1. The one branch case was showing COMPANY figures under a branch name, and would now have
     opened a branch scoped report with different numbers. Service users can have no branch at
     all, and people can sit on a branch row that is not an active `kind = 'branch'`. That scope
     is computed branch scoped now, which costs a single branch company one extra engine run and
     buys a tile that agrees with the report it opens.
  2. A Supervisor reaches this dashboard but the report viewer does not admit them, so their link
     would have bounced straight back. Links are gated on the viewer's own role list.
  3. The footnote promised "Open a branch for its full report" even when nothing on the tile was
     a link. It only says it when something is.

### 2026-07-30 The PQS report can be run across all branches

- The company PQS tile now links to `/reports/view/on-time?branch=all` (Phil). To make that mean
  something, the PQS report itself can now be run across all branches.
- It used to force a single branch, on the reasoning that local authority monitoring is per
  contract. That is still true of a return you SEND Cardiff, and it is one click away in the
  branch picker. It also made the dashboard's company wide figures impossible to open: the tile
  showing the whole company had nowhere to go.
- Three places had to agree: the view no longer defaults to the first branch and no longer dead
  ends a company with no branches, the branch picker offers "All branches" on every report, and
  the PDF and CSV route no longer refuses "all". A download that refused what the screen had just
  rendered would be the worse surprise.
