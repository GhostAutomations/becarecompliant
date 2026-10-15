# Test checklist: Rota and Visits module (beta), started 2026-10-15

Decision: `docs/decisions/rota-visits.md`. Offline design: `docs/project/rota-offline-design.md`.
Test writes on Bevan Care Ltd only; nothing written for Thistle or Demo. Every stage re-runs the
who-sees-what fingerprint (15 logins), the page timings for Dashboard, People, Service Users,
Planner and Readiness, the performance advisor counts and the realtime publication, against the
baseline below. Each check: Pass, Fail or Not tested.

## Baseline (2026-10-15, before Stage 0)

- Fingerprint, 15 logins (Founder; Admin of Thistle, Bevan, Demo; Thistle RI, RM, Recruiter,
  Supervisor, Senior, Staff; Bevan Supervisor x2, Senior, Viewer, Staff): every table and view in
  public plus Readiness per company and branch, run as each user, never signing in. Saved hashes
  kept outside the repo; a no RLS control run spots real activity in between.
- Page timings (Founder managing Bevan, data a sidebar click fetches, median of 3): Dashboard
  922 ms, People 1,003 ms, Service Users 752 ms, Planner 844 ms, Readiness 1,528 ms.
- Performance advisor: unused index 90, multiple permissive policies 135, auth connections 1.
- Security advisor: no ERROR; RLS with no policy 18, extension in public 1, SECURITY DEFINER
  executable by anon 69, by authenticated 190.
- Realtime: `supabase_realtime` empty; the Broadcast publication holds only realtime.messages.
- Database objects: 328 policies, 498 functions, 403 triggers (hashed).
- Unit tests 2,097 pass; typecheck and build pass.

## Stage 0: the module switch and groundwork

| # | Check | Result |
|---|-------|--------|
| R0.1 | Unit tests for the switch: no row is off, on is on, off again is off, malformed or missing fails closed, another module's row does not count | PASS (Claude: 5 tests, suite 2,102) |
| R0.2 | 0487 proved in the database: a Company Admin, a direct write and anon are refused; the Founder switches Bevan on; Bevan's logins see the switch, Thistle's see nothing; the proof left no rows | PASS (Claude, 2026-10-15) |
| R0.3 | After 0487: existing policies, functions and triggers identical to the baseline; realtime publication still empty; security advisor no ERROR, only the expected new WARN | PASS (Claude: 328 policies, 498 functions, 403 triggers, all three hashes identical; publication empty; 2 new WARN, one per new SECURITY DEFINER function, the accepted pattern. 0488 then limited company_module_on to the caller's own company, proved: Thistle asking about Bevan gets false) |
| R0.4 | Founder console, Bevan Care Ltd: the Modules card shows Rota and Visits (beta) Off; Switch on turns it On and writes an audit row | PASS (Claude in Phil's Chrome at his request "U test", 2026-10-15: grey Off and Switch on; after Switch on, green On and Switch off; company_modules row enabled; audit company.module_on "Switched on Rota and Visits (beta)") |
| R0.5 | Bevan, as Company Admin (Founder managing Bevan): Rota appears in the sidebar under Departments; it opens the Rota page with the Beta notice and the empty state; no other menu changes | PASS (Claude: Rota between Planner and Invoicing, the other 15 entries unchanged; page shows Rota with the Beta pill, the amber "Beta: test data only" notice and "Nothing on the rota yet") |
| R0.6 | Thistle and Demo: no Rota in the sidebar, and typing /rota shows Not Found | PASS on the evidence, at Phil's choice 2026-10-15 (Claude, live, as the Founder managing Bevan with the module still off: no Rota in the sidebar, /rota shows Page not found, tab title not naming Rota after b0090442. Thistle and Demo run the same check with no switch row; not looked at as those companies) |
| R0.7 | Bevan, as a Care Assistant or Senior Care Assistant: no Rota, /rota Not Found | PASS on the evidence, at Phil's choice 2026-10-15 (not seen on screen, needs a carer login): carers get their own short nav (lib/nav.ts staff and senior branches never include /rota) and requireRotaOffice answers Not Found for any role outside the office roles |
| R0.8 | Switch off for Bevan: Rota disappears, /rota Not Found; switch on again: back. The audit log shows both | PASS (Claude: the confirm read "Switch Rota and Visits (beta) off for Bevan Care Ltd? It disappears for them straight away. All of its data is kept."; off: Rota gone from the menu, /rota Page not found; on again: On and Saved; audit module_on, module_off, module_on) |
| R0.9 | Rota page on a phone width screen (375 px): readable, no sideways scroll | PASS (Phil's iPhone screenshot 2026-10-15, judged by Claude at his request: title, Beta pill, notice and empty state fit the width, text readable, no sideways scroll; Rota reached through More) |
| R0.10 | Nothing else changed: fingerprint identical for all 15 logins; page timings within normal variation; advisor counts as the baseline apart from the new objects; row counts as the baseline apart from the intended rows | PASS (Claude: 13 of 15 logins identical; Founder and Bevan Admin +4 rows, all real activity from Claude's own baseline visit to Bevan: 3 Readiness daily scores and 1 Founder Dashboard snapshot, matched by the no RLS control. After the screen test, Founder and Bevan Admin also see exactly the 4 test audit rows (on, off, on, support mode entry); all Thistle and Demo logins identical to the baseline. Timings after deploy, ms: Dashboard 754, People 901, Service Users 631, Planner 745, Readiness 1,435, all at or below the baseline, same payload sizes. No runtime errors after the deploy) |
