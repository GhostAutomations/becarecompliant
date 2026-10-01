# Test checklist: new company setup (creation tick list, 0365)

Run as popups, one at a time: Pass / Fail / Not tested. Phase 13 rule: test now, nothing deferred.

| # | Check | Result |
|---|-------|--------|
| ST0 | DB probe in a rolled back transaction: seed_company_defaults with Spot Check, Mentoring and Supervision (locked) unticked on People, Audit and Setup (locked) on Service Users, one course unticked: 24 forms (spot_check, mentoring, audit_su left out), Supervision and Setup kept, every check has its form, 32 courses. | PASS 1 Oct (Claude) |
| ST1 | Founder > Create a company shows "What they start with" with four folded sections: People checks 10 of 10, Service User checks 3 of 3, Training courses 33 of 33, Forms always included 14. Locked rows show a gold "Always included" reason and cannot be unticked. | |
| ST2 | Unticking a check strikes it through and the count drops; Tick all / Untick all work on courses. | |
| ST3 | A refused save (e.g. no regulator) keeps every untick and everything typed. | |
| ST4 | Create a test company with Spot Check and Audit (People) and Audit (Service Users) unticked and two courses unticked. The gold note lists what was added and "Left out: Spot Check, Audit, Audit (Service Users)". | |
| ST5 | Manage as that company: People register has no Spot Check Due, Recent Spot Check or Audit columns; Service User register has no Audit column; People summary cards have no Spot Check or Audit line. | |
| ST6 | Settings > Forms in that company has no Spot Check, Audit or Service User Audit form, and does have Health Check, Mentoring, Lead the Leader, One to One. Training has 31 courses. | |
| ST7 | An existing company (Thistle) still shows every column it showed before. | |
