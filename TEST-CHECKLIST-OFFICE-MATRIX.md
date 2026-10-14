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
| O2 | Bevan, in Chrome as Bev: Settings > Users, ZZ Test Supervisor, tick "Show on Office matrix", Save. People, Compliance: ZZ Office Test gone from Llanelli and All branches; Office branch shows them with LTL 1 done 01/06/2026, LTL 2 done 20/08/2026, LTL 3 due 08/11/2026 | PASS (Claude, Claude browser as Bev, 2026-10-14: tick saved, gone from Llanelli and All branches (34 rows, none Office), Office view headed LTL 1 to 3 showing LTL 1 done 01/06/2026, LTL 2 done 20/08/2026, LTL 3 due 08/11/2026 green. Found: the button went back to Save instead of staying on Saved; fixed) |
| O3 | Bevan: complete LTL 3 for ZZ Office Test with the Lead the Leader form: Annual Appraisal Due 80 days after it | PASS (Claude: LTL 3 completed with the Lead the Leader form on 14/10/2026, Evidence stored; Annual Appraisal Due 02/01/2027. Found: the record offered "Apply 1 missing" for the switched off supervision; fixed) |
| O4 | Bevan: complete the Annual Appraisal: LTL 1 due 80 days after it, LTL 2 and 3 show last cycle's dates | PASS (Claude: appraisal completed 14/10/2026; LTL 1 due 02/01/2027, LTL 2 and 3 show last cycle's dates) |
| O5 | Bevan: untick ZZ Test Supervisor: ZZ Office Test back in Llanelli on the Compliance matrix, Supervision 1 due where LTL 1 was | PASS (Claude: unticked in Settings; back in Llanelli, Supervision 1 due 02/01/2027, Supervision 3 done 14/10/2026 (the LTL); Lead the Leader back to ad hoc; tick and untick both in the audit log) |
| O6 | Bevan: dashboard Overdue and Due figures count the LTL for the ticked person, not a supervision; the People register report shows their latest LTL as their latest supervision | PASS (Claude: while ticked the chase list behind the dashboard, digest and chasers held Lead the Leader due 02/01/2027 and no supervision; after unticking, supervision due 02/01/2027 and no LTL due) |
| O7 | Thistle (Phil): Settings > Users shows "Show on Office matrix" on a login; tick the three supervisors named in the job (People records dd3ac98a, Newport; a7527364, Cardiff; 184fd105, Newport) | PASS (Phil, 2026-10-14; the three saved and audit logged, moved from Newport, Cardiff and Newport to Office; a Care Assistant's login shows the box greyed out with the reason) |
| O8 | Thistle (Phil): People, Compliance, Office branch shows the three with LTL 1 to 3 and Annual Appraisal matching the dry run (a7527364: LTL 1 done 31/07/2026, LTL 2 due 19/10/2026; dd3ac98a: LTL 1 due 25/07/2026 red; 184fd105: LTL 1 due 07/12/2026) | PASS (Phil, 2026-10-14) |
| O9 | Thistle (Phil): Newport and Cardiff no longer show the three; everyone else unchanged | PASS (Phil, 2026-10-14; Claude: no other Thistle person or check changed, Newport 32, Cardiff 16) |
| O10 | Claude: 0469 proved in a rolled back transaction, applied, advisor no ERROR; Bevan's form is version 2 reading "Date of Lead the Leader meeting" and its 11 completed forms keep version 1; Thistle and Demo (never used) updated in place; the only "supervision" left is the sentence about a carer's supervision | PASS (Claude) |
| O11 | Thistle (Phil): Chloe Driscoll's record, click the gold LTL 2 tile: the page is headed "Lead the Leader" and the first question reads "Date of Lead the Leader meeting" | Not tested |
