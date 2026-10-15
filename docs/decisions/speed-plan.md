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
