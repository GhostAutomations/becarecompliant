# Speed plan, no damage (5 pushes), started 2026-10-15 overnight

Phil's plan: make the app fast without changing who sees what. Five pushes, each proved by the
who-sees-what fingerprint before it ships.

Targets: click feedback under 0.15s; click to fully loaded under 0.6s on Dashboard, People, Service
Users, Planner and Readiness; server data Dashboard under 250ms, Service Users under 350ms, Readiness
under 300ms; no slow read above 50ms mean; realtime idle under 0.5s of database time per 30s.

## The safety net: the who-sees-what fingerprint

- 15 real logins across Thistle, Bevan and Demo: Founder, Company Admin (Thistle, Bevan, Demo),
  Responsible Individual, Registered Manager, Recruiter, Supervisor (Thistle, two Bevan, one of them
  on two branches), Senior (Thistle, Bevan), Team Member, Staff (Thistle, Bevan).
- For each login, every table and view in public: the row count and a hash of every row, plus
  Readiness (`get_framework_check_readiness`) for the whole company and per branch. Run read only as
  that user (`request.jwt.claims` and `set local role authenticated`), never signing in.
- A control run with no RLS spots real data changing in between (someone using the app), so a
  difference only counts if the data itself did not change.
- Identical means every login's hash is the same before and after.

## Decisions made overnight (Phil asleep, safest option taken; listed for him in the morning)

1. "Wrap auth.uid() in all 52 policies": only 4 policies had a bare `auth.uid()`; 52 is the number
   that mention it at all. The real per row cost was `is_platform_admin()`, bare 249 times in 233
   policies. Push 1 wrapped every zero argument STABLE helper (`is_platform_admin`, `auth.uid`,
   `is_staff`, `my_company_id`, `may_keep_letter_signature`) in 201 policies. Same answer, worked
   out once per query instead of once per row.
2. "Mark RLS helpers STABLE with search_path pinned": they already were (all STABLE, SECURITY
   DEFINER, search_path set). Nothing changed. The `my_*` helpers pin `search_path = public` without
   `pg_temp`; left as they are (changing them is outside a speed push).
3. No active Branch Manager exists in Thistle or Bevan (Bevan's are disabled), so the fingerprint and
   timings use Admin, RM, Supervisor and the rest; the Manager role is covered by the policy text
   being unchanged in meaning.
4. The 30,408 identical rollup calls: they came from the old Dashboard compliance buckets
   (`getComplianceBuckets`, one `person_rollup` and one `service_user_rollup` read per render, with
   the old 10 second poll), removed on 2026-09-28. The query statistics run from 7 July, so the
   count is history, not current traffic. The matching `person_check_status (person_id, due_date,
   rag)` count (30,310) confirms it. No fix needed.
5. The query statistics' mean times are mostly from before the 0415 fast lane; the before and after
   numbers in the morning report are measured fresh, per role, median of three runs.
6. Phil's message was cut off at "Push 3 ... Run the old", so the end of Push 3 and all of Push 4
   were not received. Push 3 was built as described; Push 4 was taken to be the front end side
   (stop reading what the screen never shows, remove repeated reads) and kept on the branch.

## Push 1 (live): migration 0478

- 201 policies rewritten (helpers wrapped), 21 foreign key indexes added.
- Fingerprint: all 15 logins IDENTICAL.
- Performance advisor: unindexed foreign keys 21 to 0; auth RLS initplan 4 to 0; unused indexes 69
  to 90 (the 21 new ones, unused until queried); multiple permissive policies 135 unchanged.
- Security advisor: no ERROR.
- A restore script for the 328 policies as they were was kept (outside the repo) in case of trouble.

## Push 3 and 4 (branch speed-overnight, preview only, not merged)

Push 3, migration 0479 (added to production as new functions only; nothing live calls them):
- `register_person_status(company)` and `register_service_user_status(company)`: the same rows
  as `person_check_status_all` / `service_user_check_status_all`, with the company said up front.
- `readiness_check_counts(company, regulator, branch)`: the same answer as
  `get_framework_check_readiness`, but no faster (the time goes in check level row security, not
  the joins), so the code stays on the old function. Recorded rather than wired in.
- Old path against new path, all 15 logins: every row the same (people status, service user
  status, Readiness for the company and every branch, both rollups).

Push 4, the code on the branch:
- People and Service User registers read the new functions (paged, 1000 at a time, in a fixed
  order) and work the rollup out from those rows (`lib/register/rollup.ts`, the views' own rule,
  unit tested) instead of reading the rollup views as well.
- The register's name sort is read alongside the rest instead of first.
- Readiness stores today's scores after the page is sent, from the figures the page has just
  worked out (`lib/framework/snapshot.ts`, next/server `after`). The browser no longer posts back
  for a second full readiness calculation; the old client component is removed.

Not done tonight, and why:
- Dashboard tiles, training and absence summary functions: their time is row level security
  (for a Supervisor, every other company's people are run through the slow permission functions
  before being turned away). A SECURITY INVOKER function cannot avoid that, and changing policies
  was not allowed tonight. Proposed instead as a Push 1b policy change, proved by the fingerprint.

## Push 1b (live): migration 0480 (Phil, 2026-10-15)

- The slow part for Supervisors and Seniors: for every row in their own company they may not see,
  each per row permission helper ran one at a time before the row was turned away. (A "same
  company" restrictive policy was tried first in a rolled back test and did not help; not used.)
- Fix: seven once per query list helpers (`my_on_call_company_id`, `my_team_branch_ids`,
  `my_supervised_person_ids`, `my_supervised_service_user_ids`, `my_booked_person_ids`,
  `my_booked_service_user_ids`, `my_senior_instance_ids`) and the 11 SELECT policies on people,
  check_instances, person_training and service_users rewritten to use them, with the existing
  `my_admin_company_id`, `my_wide_company_id` and `my_lead_branch_ids`. The old helpers are
  unchanged and still used everywhere else.
- Proof before applying: for all 78 profiles, every list equals exactly what its old helper says
  yes to, over every company, branch, person, service user and check instance (0 mismatches; 4
  Seniors, 256 instances true). Anon is refused before and after.
- Rolled back timing: Bevan Supervisor training 607 to 15ms, checks 257 to 10ms, Readiness 299 to
  66ms; Bevan Senior training 1,275 to 12ms, checks 763 to 17ms, Readiness 799 to 44ms.
- Fingerprint: fresh baseline taken just before applying; after applying, all 15 logins IDENTICAL.
- Security advisor: no ERROR; 7 new WARN "authenticated may run a SECURITY DEFINER function", one
  per new helper, the same accepted pattern as the 0415 `my_*` helpers (each returns only the
  caller's own lists).
- A restore script for the 11 policies as they were was kept (outside the repo).

## Push 2 (live): migration 0481 (Phil, 2026-10-15)

- Found already done on 2026-10-07: live updates use Broadcast (0418, `lib/realtime/live-bus.ts`,
  `realtime.send` into `realtime.messages`, read through `supabase_realtime_messages_publication`).
  No code subscribes to postgres_changes. The 2.6 million Realtime poller calls are from before
  then; measured idle cost now 0 calls and 0ms in 60 seconds (target under 0.5s per 30s).
- 0481 empties the old `supabase_realtime` publication (18 tables nothing read) so the old per
  subscriber change polling cannot come back by accident. The publication itself is kept, empty.
- Checked after applying: Broadcast's publication (7 tables) and replication slot untouched and
  active; a no-op update on Bevan's test blackout sent its live update message at once.
- Fingerprint after 0481: identical for all 15 logins apart from real activity in between (a
  Thistle user's audit row and profile update, matched by the no-RLS control).
- Live traffic under 0480 and 0481 (checks completed, Training, Planner, Service Users): no
  errors or warnings in the production logs.

## Sidebar: pages fetched on hover, and just visited pages remembered (Phil, 2026-10-15)

Popup "A and B now" (C, sign-in checked once per page, left for its own careful job):
- B: sidebar links no longer fetch every page on screen in the background (about twenty requests
  per page opened, each running the sign-in checks). Resting the pointer on a link for 120ms, or
  focusing or touching it, fetches that whole page (`components/nav-link.tsx`, used by all three
  sidebars).
- A: a page visited or fetched in the last five minutes comes back at once (`staleTimes` in
  next.config.ts; 30 seconds at first, five minutes at Phil's popup the same day).
  `components/route-memory.tsx` listens on the company's live channel all the time; back on a
  remembered page after something changed, the page is quietly brought up to date. Only then: an
  update makes Next forget every remembered page, so updating every return after 30 seconds (tried
  the same day) made every click slow again and was taken out. 0483 adds the live signal to the
  tables behind Planner, policies, invoicing, whistleblowing, inspections and record updates, so a
  change there is never missed. Your own saves clear the memory (revalidatePath).

## Sign in checked once per request (C, Phil 2026-10-15)

- Middleware asks Supabase Auth who the person is (auth.getUser) on every request, as before, and
  passes the confirmed user id on to the page in the request header `x-bcc-verified-user`
  (`lib/auth/verified-user.ts`). It deletes any copy of that header a browser sends, before setting
  its own, and only sets it once Auth has said yes.
- The page guard (`requireUser`) uses it only when it matches the session in the same request's
  cookie; otherwise it asks Auth itself, exactly as before. The single session slot check, the
  reset link check and the disabled login check are unchanged.
- Saves one Auth round trip per page, server action and live refresh (about 50 to 100ms).
