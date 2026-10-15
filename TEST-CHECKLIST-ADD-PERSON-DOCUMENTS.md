# Test checklist: DBS and Right to Work on Add a person, 2026-10-15

Phil's job. Migration 0485. Decision: `docs/decisions/add-person-documents.md`. Baseline: Add a person
436 ms, register 728 ms, record 922 ms (median of 5), save 1.95 s; a new person had 9 checks, probation
due, no DBS or RTW, no Evidence, audit person.created.

| # | Check | Result |
|---|-------|--------|
| A0 | Unit tests: DBS one or the other (details, tick, both, neither, blanks), RTW required, recipients once each, the form token, the record notice words | PASS (lib/people/add-person-docs.test.ts, 6) |
| A1 | Rolled back proof of 0485: every person identical apart from the new empty column; a second person with the same token refused (23505); people without a token unaffected | PASS (before applying) |
| A2 | Bevan: add a person with DBS details and Right to Work: DBS and RTW cards filled, two Evidence rows (form version, author, time), audit person.created and two person.tracker_form_completed, register row | PASS (Bev Admin in the built-in browser: ZZ Test DBS and RTW; DBS 10 Jan 2026, Enhanced DBS 10 Jan 2029 worked out, RTW limits None; Evidence dbs_renewal v2 and right_to_work v1 by Bev Admin; audit person.created and two person.tracker_form_completed; 9 checks as before) |
| A3 | Bevan: add a person with "No DBS yet": the email reaches the adder and line manager, its button opens that person's DBS Pending Risk Assessment, the DBS card is red | PASS (ZZ Test No DBS: ticking hid and cleared the DBS details; one email sent to the Bev Admin address, the adder and the only line manager, logged once; its link opens DBS Pending Risk Assessment for that person; DBS card red Not recorded, header Overdue; RTW visa to 30 Jun 2027) |
| A4 | Bevan: save with neither: refused, plain words, nothing typed lost, nobody added | PASS ("Fill in the DBS details, or tick No DBS yet", and the Right to Work questions named; everything typed kept; no person made) |
| A5 | Bevan: double click Add person: one person, one set of Evidence, one email | PASS (three presses: one person, two Evidence rows, one set of audit lines) |
| A6 | Bevan: with "They already work here" ticked: no DBS or RTW boxes in the panel; probation and history saved as before | PASS (panel: four probation boxes and eight history boxes only; probation passed and its end date, Manual Handling done 1 May 2026 due 1 May 2027, DBS and RTW as Evidence) |
| A7 | Phone width: the sections stack, canonical controls | PASS (375 wide: stacked, no sideways scroll, the form renderer's own controls) |
| A8 | Timings after: Add a person, register and record no slower than the baseline; the save measured | PASS (median of 10: Add a person 463 ms (436 before), register 637 ms (728), record 902 to 1,122 ms over two rounds (922), all within run to run noise. The save does more now: 2.1 to 2.7 s with DBS and RTW Evidence, about 3.0 s with the email, against 1.95 s before with neither; first build was 3.8 s, the two forms now file side by side) |
| A9 | Phil: Bevan Add a person, the sections, the one or the other rule, the error with neither | PASS (tested by Claude as Bev Admin in the built-in browser at Phil's request) |
| A10 | Phil: the risk assessment email in the inbox, with its button | PASS (Phil, ppdavies+cob inbox) |
| A11 | Phil: a test person's record, DBS and Right to Work cards filled from Add a person | PASS (tested by Claude at Phil's request: DBS 10 Jan 26 and 10 Jan 29, RTW no expiry, limits None, Evidence history 2 by Bev Admin) |

The five Bevan test people (ZZ Test Baseline Add, DBS and RTW, No DBS, Double Click, Already Here) made leavers and archived at Phil's choice; their Evidence is kept.
