# Test checklist: Holiday blackout dates, 2026-10-15

Decision: `docs/decisions/holiday-blackouts.md`. Migration 0477. Test writes on Bevan Care Ltd only;
no writes to Thistle or Demo. Run one at a time.

| # | Check | Result |
|---|-------|--------|
| B0 | Claude's own checks: 6 new unit tests (the words match the database, fully inside, one day overlapping, the day after, another branch, All branches and no branch, the calendar across the month end and 31 Dec into January, the staff list, who already has holiday in a new blackout); full suite, typecheck and build pass | PASS (Claude: 2,041 tests) |
| B1 | 0477 proved in a rolled back transaction on Bevan: an approved and a pending holiday made before a blackout stay as they were; the Registered Manager adds Swansea 20 Dec to 2 Jan "Christmas cover", an All branches single day and a Neath month end; a Supervisor, a Branch Manager and a direct write are refused; a Swansea staff member is blocked fully inside, one day overlapping and on the single day, with the exact words, but not the day after; a Neath staff member can book the Christmas dates and is blocked on Neath's month end; the Branch Manager cannot approve the clashing pending request, nor approve it anyway; the Registered Manager is blocked without Book anyway and allowed with a reason, stamped and logged, and can approve the pending one anyway; a staff Change dates into the blackout is blocked; the public no login form is blocked inside and allowed outside; cancelling a holiday inside the blackout is unaffected | PASS (Claude) |
| B2 | After 0477 is applied, live on Bevan through the screens: the blackout made by Bev Admin; a staff member blocked in /my with the message and the form keeping what was typed; Book anyway by Bev Admin with a reason, shown on the holiday; before and after row counts | Not tested |
| B3 | Phil: Bevan as Company Admin, People > Holidays > Blackout dates: the test blackout, its branches and reason | Not tested |
| B4 | Phil: Bevan as a test staff member: booking in the blackout shows the message with the dates and reason | Not tested |
| B5 | Phil: the holiday calendar: blackout days shaded with the reason | Not tested |
