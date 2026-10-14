# Test checklist: Office matrix, Lead the Leader in place of supervisions, 2026-10-14

Decision: `docs/decisions/office-matrix.md`. Migration 0468 (applied 2026-10-14). Run one at a time.

Bevan test records (Llanelli, linked to existing Bevan test logins, no new accounts):
"ZZ Office Test" (Supervisor, login ZZ Test Supervisor, probation passed 13/01/2025, appraisal
10/03/2026, Supervision 1 done 01/06/2026, Supervision 2 done 20/08/2026, Supervision 3 due
08/11/2026) and "ZZ Office Test Two" (Supervisor, login ZZ TEST Sup Swansea, probation passed
01/09/2026, no supervisions).

| # | Check | Result |
|---|-------|--------|
| O0 | Claude's own checks: 9 new unit tests (the LTL cycle, carry on in both directions, probation start, the tick rules); full suite 1,996 pass, typecheck and build pass; migration proved in a rolled back transaction (tick, LTL 3, appraisal, untick, the refusals, a Swansea supervisor refused the Office person at the database); after applying, Thistle, Bevan and Demo chase lists, rollups, readiness and Service User lists identical to before; only the intended functions, policy and triggers changed; security advisor no ERROR | PASS (Claude) |
| O1 | Bevan, ZZ Office Test Two ticked straight after probation: in Office, LTL 1 due 20/11/2026, supervision not chased, audit logged | PASS (Claude, database) |
| O2 | Bevan, in Chrome as Bev: Settings > Users, ZZ Test Supervisor, tick "Show on Office matrix", Save. People, Compliance: ZZ Office Test gone from Llanelli and All branches; Office branch shows them with LTL 1 done 01/06/2026, LTL 2 done 20/08/2026, LTL 3 due 08/11/2026 | Not tested |
| O3 | Bevan: complete LTL 3 for ZZ Office Test with the Lead the Leader form: Annual Appraisal Due 80 days after it | Not tested |
| O4 | Bevan: complete the Annual Appraisal: LTL 1 due 80 days after it, LTL 2 and 3 show last cycle's dates | Not tested |
| O5 | Bevan: untick ZZ Test Supervisor: ZZ Office Test back in Llanelli on the Compliance matrix, Supervision 1 due where LTL 1 was | Not tested |
| O6 | Bevan: dashboard Overdue and Due figures count the LTL for the ticked person, not a supervision; the People register report shows their latest LTL as their latest supervision | Not tested |
| O7 | Thistle (Phil): Settings > Users shows "Show on Office matrix" on a login; tick Lauren Morgan, Chloe Driscoll and Gabrielle Thomas | Not tested |
| O8 | Thistle (Phil): People, Compliance, Office branch shows the three with LTL 1 to 3 and Annual Appraisal matching the dry run (Chloe LTL 1 done 31/07/2026, LTL 2 due 19/10/2026; Lauren LTL 1 due 25/07/2026 red; Gabrielle LTL 1 due 07/12/2026) | Not tested |
| O9 | Thistle (Phil): Newport and Cardiff no longer show the three; everyone else unchanged | Not tested |
