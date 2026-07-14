# Be Care Compliant — Phase 10 kickoff (paste this into a new chat)

We are continuing **Be Care Compliant (BCC)**, the commercial multi-tenant SaaS that keeps UK care companies inspection-ready for CQC (England) and CIW (Wales) and their local authorities. This is an established, live project. **Phases 0 through 9 are COMPLETE and deployed.** We are now starting **Phase 10 — Additions**: the parked backlog of ideas plus new ones Phil will add.

**Do NOT start coding.** Read, verify, then plan with me by popup which Additions items to build this round, and in what order, before writing anything.

## First, orient yourself (before proposing anything)

1. Read `PHASES.md` in the repo (the master phase plan and source of truth). Read `MEMORY.md` and the memories it links, especially: `bcc-project-state`, `bcc-brand-decisions`, `bcc-permission-boundaries`, `bcc-phase2-decisions`, `bcc-phase3-decisions`, `bcc-phase4-built`, `bcc-back-navigation`, `bcc-seed-checks-values-null-gotcha`, `bcc-form-renderer-hooks-bug`, `cowork-sandbox-limits`, and the notifications/billing/reporting memories. These carry decisions and hard-won corrections you must not relearn.
2. **Confirm the Supabase project before any SQL.** It is **becarecompliant**, ref **`bgrtcvyjuwopunpnudeu`**, region eu-west-2 (London). NEVER run BCC SQL against `joincarenow` (afwfutlwuhqzdihwsibr) or `carer-academy` (bamokbdtlzllbrsdxywp). Verify the target on every apply. The service-role client needs the **`sb_secret_` key** on this project's new API-key system (the publishable/anon key gives "User not allowed" 403s).
3. **Latest migration is `0062`** (fixed People-check seeding). The next new migration is `0063`.

## Phase 10 scope — the Additions backlog (agree which to build, and the order, by popup first)

These are already parked in `PHASES.md` under Phase 10. Phil will likely add more before we start. Do not assume this list is final or correctly ordered.

1. **Complaints section** (confirmed by popup). A THIRD top-level section alongside People and Service Users. Vocabulary (confirmed): section "Complaints", one record = a "Complaint", collection view = the "Complaints register". Data model (confirmed) = a CASE with an Open / In Progress / Closed lifecycle plus dates (raised, occurred, acknowledged, investigation completed, outcome). NOT the recurring Check/RAG model, no recurrence engine, no due-date rollup. The three complaint forms already in the founder library (`complaints_concerns`, `cardiff_complaint_response`, `newport_complaint_response`) become the Complaints forms and attach as Evidence; on build, repoint their population from the interim `service_users` to a new `complaints` value. Work: new population value `complaints` (migration: complaints table with company_id + branch_id + status + dates + free-text, RLS with is_company_member/is_company_admin patterns + role isolation + audit logging), nav entry + register list (status pills, filter by status/branch, empty state), record drill-down (case detail + attached Evidence + status transitions), and a dashboard surface. Reuse the register shell, pill-select, back-link, forms engine + immutable Evidence, and the one export module. GDPR: complaints can hold special-category service user data, so same isolation + read-audit rigour as Service Users.

2. **Public (no-account) forms for Team Members** (standing decision). Team Members will NOT have app accounts. Forms (starting with Holiday, then absence/other TM-facing forms) are exposed as PUBLIC web pages linked from the company's own "team area". Build: (1) a public form page per company + per form (e.g. `/f/<company-slug>/<form-key>`) that ONLY writes, never reads other tenant data; (2) a secure public submit endpoint, rate-limited + honeypot (no CAPTCHA available), signature/slug-scoped, fail-safe, added to middleware `PUBLIC_PATHS`, never exposing the service-role client; (3) MATCH to a Person BY EMAIL against `people.work_email`, and if no match, hold the submission in an "unmatched queue" for a Manager/Admin to link rather than guessing or dropping; (4) create the same Evidence + holiday_request/absence_event rows as the in-app flow. GDPR: public intake of personal data, so validate + rate-limit hard, and audit. Revisit the Holidays & Absence TM-self-request path once this exists. Confirm form set, URL scheme and the unmatched-queue UI by popup.

3. **Import founder templates into an EXISTING company.** `seed_company_form_templates` only runs at company CREATION; there is no way to pull newly added/updated master templates (forms, People/Service User checks, training courses) into a company that already exists. Build a founder action to copy selected active master templates into an existing tenant, idempotent (skip keys already present). Note the seed functions are SECURITY DEFINER and guard to platform_admin or the company's own admin; an admin path plus a founder path both make sense.

4. **Custom check types as register columns.** A check type created via Settings > People/Service Users > New check type (Phase 5) reaches the data, the drill-down and the RAG rollups, but does NOT get its own column in the dense register matrix (which renders a fixed curated set, `REGISTER_COLUMNS` / `SU_REGISTER_COLUMNS`, mirroring Phil's Monday board). Extend both register matrices to render custom check definitions as extra columns on the right (next due + last completed cells + Complete route).

5. **Editable formal letter templates.** The absence meeting invitation email is a fixed formal letter in `bookAbsenceMeeting`. Add per-company editable letter templates: a Settings screen where an Admin edits wording with placeholders (employee name, stage, date/time, manager, company), versioned like forms, used by the booking email and future formal letters (probation, disciplinary). Confirm the placeholder set and which letters are templatable by popup.

6. **AI Return to Work.** After a staff member returns from an absence, AI drafts/assists a Return to Work interview (questions + summary from the absence record, or completes a RTW form) tied to the `absence_events` record, stored as immutable Evidence. Uses the Anthropic integration + per-company AI usage metering. STANDING RULE: a RTW interview happens after EVERY absence at EVERY stage, so the flow fires on every occasion. Confirm the RTW form/template and where it surfaces by popup.

7. **Absence meeting invitations / questions / outcomes.** Extend the meeting flow (`absence_meetings`, Stage 1 to 4): (1) INVITATIONS — branded invite + .ics when a meeting is scheduled (reuses the email + .ics infra); (2) QUESTIONS — a stage-specific set of meeting questions; (3) OUTCOMES — capture outcome (agreed actions, warning level, next stage, review date) against `absence_meetings`, stored as immutable Evidence, surfaced on the Absence card + Person drill-down.

8. **Edit an existing user's branch assignment** (reassign or add branches) from the Users screen. Phase 1 sets a user's branch at invite time only; changing it later is not built.

9. **Setup / Transfer onboarding (bulk backfill).** An onboarding flow for a company coming on board to enter existing compliance dates (last completed and/or next due for each check, People and Service Users) WITHOUT completing every form. Bulk backfill of `check_instances` / tracker dates so a new tenant starts with an accurate RAG picture. Must respect the recurrence engine (next due from the entered last-completed date via the shared `lib/recurrence.ts`) and the immutable-Evidence model (dates set without fake Evidence, or a clearly flagged "migrated, no form" marker). Likely CSV import plus a grid entry screen.

(Phil will add more items here.)

## How we run a phase (follow exactly)

- Before any code, run ONE `AskUserQuestion` popup to agree which Additions items to build this round and the order (recommended option first, labelled "(Recommended)"). Additions is a backlog: we do NOT build all of it at once; we pick a slice.
- Then set up the two progress boxes with the task tools: the top **"Phases"** box lists every phase; the second **"Phase Progress"** box shows ONLY the current round's tasks, ticked as they complete. Keep both current without me asking. Mirror into `PHASES.md`.
- The third-from-last phase is **"Additions"** (this one), second-from-last is **"Final Testing"**, last is **"Marketing & Launch"**. New ideas mid-build get a popup: current round or back to the Additions backlog, your recommendation first. Anything not tested at build time goes into Final Testing immediately, in enough detail to test cold. Never silently skip testing.
- All questions and all decisions to me are popups, never loose questions in chat. For any UI change, restate what the result will look like (size, placement, density) and sanity-check it against my stated goal before committing.

## STANDING RULES AND MISTAKES ALREADY CORRECTED — do NOT repeat these

### Deploy workflow (this project is different from Join Care Now)
- There is NO ship alias and no assumed local tooling. Never tell me to "run ship" or give bare "git push" prose.
- Apply migrations through the Supabase MCP tools to ref `bgrtcvyjuwopunpnudeu` ONLY (verify the project first), AND write every migration as a numbered SQL file in `supabase/migrations/` (next is `0063`) so the repo stays the source of truth.
- Vercel auto-deploys on push to main. Anything I must run locally ends with EXACTLY ONE copy-paste terminal block: `cd "<repo>" && git add -A && git commit -m "..." && git push`. Never prose steps, never multiple blocks. Prefix with `rm -f` for any stale git lock files if needed. Verify deploy status + build logs with the Vercel tools rather than assuming success.
- Anything I must do in an external app (Vercel, Stripe, Resend, Twilio, Supabase dashboard, DNS) = a numbered, click-by-click walkthrough with the exact values to paste.
- Never ask me to test a feature before confirming the code is deployed AND its migrations are applied.

### Build correctness (the sandbox cannot reliably build or typecheck — npm registry blocked, tsc slow on the iCloud mount, so the Vercel build is the real compile gate; write carefully)
- **Supabase nested to-one relations infer as ARRAYS in TypeScript.** Cast them `as unknown as T[]`.
- **`Record<Tier, ...>` (and any keyed record) cannot be indexed by a plain `string`.** Use a safe accessor (e.g. `tierLabel()` in `lib/founder/format.ts`) or cast `x as Tier`, rather than `MAP[stringVar]`.
- **`"use server"` files may export ONLY async functions.** Keep types/consts/objects (and non-exported sync helpers are fine) in `lib/`. tsc will not catch this; `next build` will.
- **Never `redirect()` from a Server Action to a URL with a query string** (Next.js #78396 / React #310, "Rendered more hooks than during the previous render"). Use the ActionState pattern: return `redirectTo` and `router.replace` it client-side. Shared types live in `lib/forms.ts` (`ActionState`, `IDLE_STATE`). Redirecting to a path with NO query (e.g. `/dashboard`, `/founder`) from a Server Action is fine.
- **An all-NULL column in a Postgres `VALUES (...)` list is typed `text`** and clashes with a typed target column (this was the 0062 bug: seeding People checks failed because the all-NULL `amber_days` column typed as text vs the integer column). Cast such NULLs (`null::int`, or `v.col::int` in the SELECT) whenever inserting into a typed column from a VALUES source.
- **Remove unused imports/vars before committing** — the Vercel build fails or warns on them and you cannot lint in the sandbox. When you delete a section, delete the now-unused imports, queries and helpers with it.
- **"Done" means traced, not typechecked.** Trace every path that sets or resets state before claiming a fix works. Verify against real state (code, migrations, Vercel deploy, Supabase) instead of guessing.

### Security (DB-enforced, not UI-enforced)
- Every tenant table carries `company_id` (and `branch_id` where relevant); isolation via RLS with the `is_company_member` / `is_company_admin` / `is_platform_admin` / `is_branch_manager` / `is_branch_member` / `is_branch_team_member` helper patterns. **Every core tenant table already grants `is_platform_admin()`**, so the founder has full cross-company access WITHOUT loosening tenant RLS — never widen a policy to give the founder access; it is already there.
- Privileged writes go through SECURITY DEFINER RPCs with `search_path` pinned and internal authorisation checks. An end-user-callable SECURITY DEFINER RPC still runs with the caller's `auth.uid()`, so guard by record ownership, not just membership. (The seed RPCs guard to `is_platform_admin() OR is_company_admin(cid)` — they cannot be called from the SQL editor, which has no `auth.uid()`.)
- Secrets stay server-side, never `NEXT_PUBLIC_`; the service-role client (needs the `sb_secret_` key) must never appear in a client component. A Vercel env change only takes effect after a redeploy.
- Webhooks and crons fail closed in production when their secret is missing; verify signatures (Stripe/Twilio/Resend); webhook paths go in the middleware `PUBLIC_PATHS`.
- **Single-session login** is enforced server-side (one active session per user; a new login signs the old device out, via `requireUser` + `user_sessions` + `claim_session`). Keep it working.

### Founder console + manage-as (Phase 9, LIVE — do not regress)
- The founder's home is `/founder` (the Founder console). A non-impersonating platform_admin is redirected off `/dashboard` to `/founder`, and their sidebar shows ONLY "Founder" (`navEntriesForRole` special-cases platform_admin). The founder console pages are FULL WIDTH (`w-full`), founder-only; tenant pages keep their normal centred width.
- **Manage-as-company** is an application-layer scoping layer, NOT an RLS change: a signed, httpOnly, 30-minute cookie (`lib/founder/manage-as.ts`, HMAC over `SUPABASE_SERVICE_ROLE_KEY`, fail-closed) that the company-scoping guards read via `applyManageAs` in `lib/auth/guards.ts` to return a SHADOW profile (company_id = acting company, role = company_admin) so every existing tenant page/action works unchanged. `requireProfile` / `requirePlatformAdmin` stay on the REAL profile so `/founder` and Exit still work. No second login (single-session untouched). The layout shows the acting company's nav + an amber banner with a one-click Exit; enter from a company drill-in. `writeAudit` auto-tags every write during a manage-as session with `actor_role = "platform_admin"` + `metadata { impersonating, acting_company_id }` (central, no per-action changes). Do not break any of this.

### Realtime gotcha
RLS-protected tables need `REPLICA IDENTITY FULL` for UPDATE/DELETE events to reach subscribers, the table must be in the `supabase_realtime` publication, subscribe UNFILTERED (RLS scopes events; filtered subscriptions drop them), and keep a poll fallback (`components/realtime-refresh.tsx`).

### Performance
The Vercel functions region is pinned to `lhr1` (London) in `vercel.json` next to Supabase eu-west-2 — do not remove it. Every request is company-scoped and small; do not load-all for large lists (paginate/scope). Cross-company founder views scope and paginate deliberately.

### Terminology (hard requirement)
Never use the words "item" or "board" anywhere (UI, code, conversation). Vocabulary: **Record, Register, Check, Form, Evidence**. New sections confirmed: **Complaints / Complaint / Complaints register**. "Founder" = me, the platform owner; "Admin" = a company-level role — keep them distinct. Confirm any NEW vocabulary with me before it ships.

### Copy and UI
- **NO dashes in customer-facing copy.** Use commas, colons and full stops, never em dashes or hyphen punctuation (UI, emails, templates, everything). This was reintroduced and corrected several times.
- Canonical form controls only, styled centrally in `globals.css` (bare `input`/`select`/`textarea`/`checkbox`/`radio` are auto-styled). Never style a control inline. Never use `border-gray-300` or `hover:bg-gray-*`. Mirror an existing screen when building a new one.
- Every sub-page needs a clear Back link (`components/back-link.tsx`); top-level nav pages are exempt.
- Sidebar active state uses "most specific child wins" (`components/app-nav.tsx`).
- Empty/zero state on every new screen. Data-heavy screens stay calm. RAG colours stay readable and accessible (semantic `.pill-*` classes, not ad-hoc colours). Mobile-responsive and accessible throughout (registers stack / scroll on phones; the founder console collapses 4-up tiles to 1 column at phone width).
- Save-button discipline: every `<form action={serverAction}>` uses the `useActionState` pattern (solid primary button, instant "Saving…", visible errors, update-count checked so an RLS no-op surfaces). Canonical examples: `components/settings/branch-form.tsx`, `components/people/edit-person-form.tsx`, `components/founder/*`.
- Emails: branded CTA buttons only, never plain-text links; emails silently no-op if `RESEND_API_KEY`/`RESEND_FROM` are missing, so flag that dependency whenever email is involved.

### GDPR
Service User (and complaint) data is special-category health data. Read-audit on ACCESS not just writes, signed short-lived URLs for files, strict tenant + role isolation, retention/anonymisation designed in. Flag GDPR impact on any feature touching personal data.

### Ways of working we have corrected before
- **Check before you build:** search the codebase first, every time. If something exists (or a close version), extend it — never create a parallel one. Reuse the shared helpers (register scrollbars, evidence bucket, the one export module, the one FormRenderer, `lib/recurrence.ts`, `lib/founder/format.ts` + `stats.ts`, `lib/invites.ts`, `writeAudit`, `syncSeatQuantity`).
- **Treat my corrections as permanent standing rules.** Never reintroduce something I have rejected.
- When I ask for a small UI change, do exactly that and sanity-check the direction (e.g. "make it smaller to save space" must not make anything bigger). Restate the intended result before committing.
- Idempotency + edge cases at build time: safe to run twice; exclude leavers/archived/discharged from active views, reminders, rollups and reports; recurrence date maths is Europe/London and lives in `lib/recurrence.ts`.
- Communication: plain English, concise. When done, tell me what changed + the one deploy block, not a play-by-play. SQL and one-off commands inline in chat, never as files I must open.

## Open Final Testing carry-ins (context, not this phase's work)
Logged in `PHASES.md` Phase 11: manage-as 30-minute auto-expiry actually lapsing; holiday emails F1-F4 (need the public forms above); live Twilio SMS (no Twilio account yet); recurrence/tz cold checks; and other per-phase cold checks. Do not start Final Testing now; just keep logging anything untested into it.

Start by reading `PHASES.md` and the memories, confirming the Supabase project, then come back to me with a single popup proposing which Additions items to build this round and in what order (recommended first). Do not write code before we agree it.
