# Test checklist: staff on Parental Leave or Long Term Sick, checks paused, 2026-10-15

Phil's job (all companies). Migration 0484. Decision: `docs/decisions/leave-pause.md`. Mirrors
`TEST-CHECKLIST-HOSPITAL-PAUSE.md`.

Run one at a time.

| # | Check | Result |
|---|-------|--------|
| L0 | Unit tests: on leave or not, the PL and LTS badges, paused or not (dated, undated, done one off), the words, the return date checks, return + 7 over month, year and leap day, training on leave and after, the worked out cycle slots, the People rollup with paused | PASS (lib/people/leave-pause.test.ts 11, lib/register/rollup.test.ts) |
| L1 | Rolled back proof of 0484: Thistle's three and Demo's one on leave have every dated check paused and since today; their rollups paused; every other person's checks, rollups and training identical to a fresh reading; Service Users identical; Bevan identical; register function equals the view and the two Readiness functions agree for all three companies; Bevan cycle: on leave all paused, move to LTS keeps the pause, a future return refused in plain words, back 2 days ago moves the overdue Spot Check to return + 7 (amber), later checks unchanged | PASS (before applying) |
| L2 | Rolled back per login fingerprint, 15 logins: the six People relations and the register function identical for everyone not on leave; Readiness changes only where the people on leave are visible (Thistle 12/40/410/462 to 10/38/398/446, Demo 34/66/318/418 to 33/66/313/412) | PASS (before applying) |
| L3 | Bevan: set one person to Parental Leave. Matrix: dimmed, PL badge, check cells "Paused", DBS and Right to Work at full colour; record pill "Paused: on parental leave since [today]" | PASS in the database (Bevan test person: since today, all 6 dated checks paused, rollup paused, DBS and Right to Work dates untouched). Screens checked live on a Thistle record instead (looking only): header "Paused: on parental leave since 15 October 2026", "Parental Leave" pill, each check tile "Paused: on parental leave", Supervision 3 box "Paused". Matrix by Phil in L8 |
| L4 | Bevan, that person on leave: Dashboard Overdue and Due no longer count them; Readiness drops their checks; their training reads Paused and the percentages leave them out | PASS in the database (no red or amber row for them, so none on the Dashboard; Readiness 11/10/202 to 10/10/196). Training pause proved by unit tests |
| L5 | Bevan, that person on leave: an Overdue report export (CSV) has none of their checks; the daily report dry run has no line for them except DBS or Right to Work | PASS in the database (0 rows the Overdue report or the daily report read for them; there is no dry run switch, so the daily report's own query was run) |
| L6 | Bevan: back to Active, the date box asks "Date they came back from parental leave"; a future date is refused; with today the overdue checks are amber due today + 7, later ones unchanged | PASS in the database (back today: Spot Check due 14 Oct now amber due 22 Oct, own date kept, the rest unchanged; Readiness 10/11/202; a future date refused, proved in L1). The date box itself not yet seen on screen |
| L7 | Bevan: repeat L3 to L6 with Long Term Sick (badge LTS, "on long term sick"). Everything put back as it was | PASS (Long Term Sick: 6 paused, rollup paused, Readiness 10/10/196, 0 report rows. Put back: active, resumed date and return date cleared; checks, Readiness 11/10/202 and row counts as before) |
| L8 | Thistle People Matrix (as Founder, looking only): the three on leave dimmed with PL or LTS, their checks Paused, Right to Work and DBS normal | PASS (Phil, 2026-10-15) |
| L9 | Thistle Dashboard counts no longer include them | PASS (Phil, 2026-10-15; Thistle People checks overdue 10 to 8, due soon 30 to 28; the Long Term Sick person's Right to Work not recorded kept on purpose) |
| L10 | An Overdue report export leaves them out | PASS (Phil, 2026-10-15) |

After applying (live, 2026-10-15): the per login fingerprint matches the rolled back trial for every login that cannot see Bevan; the three that can (Bevan Admin, a Bevan branch login, the Founder) differ only by the Bevan test person's updated_at from the L3 to L7 cycle, with their checks, Readiness and row counts restored exactly.
