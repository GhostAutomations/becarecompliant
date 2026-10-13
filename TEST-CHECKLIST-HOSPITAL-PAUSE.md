# Test checklist: service users in hospital, checks paused, 2026-10-13

Phil's job (all companies). Migration 0461. Decision: `docs/decisions/hospital-pause.md`. Bevan test
service user: ZZ Hospital Test (Swansea): Setup Visit done, Care Plan Review due 1 Oct (overdue),
Audit due 5 Oct (overdue), Platform Audit due 1 Feb 2027 (not due).

Run one at a time.

| # | Check | Result |
|---|-------|--------|
| P0 | Unit tests: paused or not (hospital, active, respite, done one off, no due date), the 7 day rule, idempotent, hospital and back twice, month ends, 29 Feb 2028, the clock change, the paused words, the return date checks | PASS (lib/service-users/hospital-pause.test.ts, 9) |
| P1 | Rolled back proof of 0461 on ZZ Hospital Test: in hospital gives three paused and the done Setup Visit green, since today, rollup paused, nothing red or amber for chasers; future return refused; back today gives Audit and Care Plan Review amber due today + 7, own dates kept, Platform Audit unchanged; hospital again then back the same day changes nothing; a completion clears the resumed date; a return before going in is refused; in 20 Aug and back 31 Aug moves nothing earlier | PASS (before applying) |
| P2 | Bevan: set ZZ Hospital Test to Hospital on its record. Header pill "Paused: in hospital since [today]"; each check tile "Paused: in hospital"; Setup Visit still Compliant | |
| P3 | Service Users, Hospital view: ZZ Hospital Test's cells read "Paused" in grey; nothing else on the matrix moves | |
| P4 | Dashboard: Overdue and Due tiles no longer count ZZ Hospital Test; Service User Summary says how many are in hospital | |
| P5 | Readiness: the two overdue checks are no longer counted | |
| P6 | No reminder, chaser or digest line for ZZ Hospital Test (they only act on red or amber; checked in the database) | |
| P7 | Register and compliance exports (PDF and CSV): ZZ Hospital Test listed, "Paused: in hospital since [date]" in a Paused table, not in Overdue, never Compliant | |
| P8 | Set back to Active: the date box appears; a future date is refused; with today's date the two checks show amber, due today + 7; Platform Audit unchanged | |
| P9 | Thistle, Matthew Simon (as Founder, looking only): header and tiles read "Paused: in hospital" (no date); his Audit and Care Plan Review are no longer red; Newport red count 5 to 3 | |
