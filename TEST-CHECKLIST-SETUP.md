# Test checklist: new company setup (creation tick list, 0365)

Run as popups, one at a time: Pass / Fail / Not tested. Phase 13 rule: test now, nothing deferred.

| # | Check | Result |
|---|-------|--------|
| ST0 | DB probe in a rolled back transaction: seed_company_defaults with Spot Check, Mentoring and Supervision (locked) unticked on People, Audit and Setup (locked) on Service Users, one course unticked: 24 forms (spot_check, mentoring, audit_su left out), Supervision and Setup kept, every check has its form, 32 courses. | PASS 1 Oct (Claude) |
| ST1 | Founder > Create a company shows "What they start with" with four folded sections: People checks 10 of 10, Service User checks 3 of 3, Training courses 33 of 33, Forms always included 14. Locked rows show a gold "Always included" reason and cannot be unticked. || PASS 1 Oct (Claude, Chrome): counts 10 of 10, 3 of 3, 33 of 33, 14; Supervision, Annual Appraisal, Setup, Care Plan Review locked with gold reason. |
| ST2 | Unticking a check strikes it through and the count drops; Tick all / Untick all work on courses. || PASS 1 Oct: unticks struck through, counts 8 of 10, 2 of 3, 31 of 33. |
| ST3 | A refused save (e.g. no regulator) keeps every untick and everything typed. || PASS 1 Oct: email without Admin name refused with the message; name, regulator, email and every untick kept. |
| ST4 | Create a test company with Spot Check and Audit (People) and Audit (Service Users) unticked and two courses unticked. The gold note lists what was added and "Left out: Spot Check, Audit, Audit (Service Users)". || PASS 1 Oct: note read "Added 24 forms, 8 People checks, 2 Service User checks and 31 training courses. Left out: Spot Check, Audit, Audit (Service Users). 2 training courses left out." |
| ST5 | Manage as that company: People register has no Spot Check Due, Recent Spot Check or Audit columns; Service User register has no Audit column; People summary cards have no Spot Check or Audit line. || PASS 1 Oct: People register 22 headers, 22 cells, no Spot Check or Audit; Service User register no Audit; People summary has Manual Handling and no Spot Check or Audit line. |
| ST6 | Settings > Forms in that company has no Spot Check, Audit or Service User Audit form, and does have Health Check, Mentoring, Lead the Leader, One to One. Training has 31 courses. || PASS 1 Oct (database: Business tier hides the Forms list): 24 forms, no spot_check, audit or audit_su; health_check, mentoring, lead_the_leader, one_to_ones present; 31 courses. |
| ST7 | An existing company (Thistle) still shows every column it showed before. || PASS 1 Oct (traced): Thistle, Bevan and House Test all have every curated check active, so every column draws; no company has one missing. |

Test company ZZ Tick List Test created for ST4 to ST6 and deleted from the founder page the same day (purges 31 Oct).
