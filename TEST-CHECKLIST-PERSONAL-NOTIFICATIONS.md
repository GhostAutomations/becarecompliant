# Test checklist: Per person notifications, 2026-10-14

Decision: `docs/decisions/personal-notifications.md`. Migration 0473. Test writes on Bevan Care Ltd
only (the Supervisor default reaches Thistle and Demo with no rows written). Run one at a time.

Bevan test set up (records by id, branch A = Swansea, branch B = Neath):
- S1 `9b7d6cae` Supervisor, Swansea, the default.
- S2 `59e6f61f` Supervisor, Swansea (activated for the test), Email ticked for Care Plan Review.
- S3 `f9de80b6` made a Supervisor in Neath (activated for the test), Swansea added.
- TM `fa994481` Viewer (Team Member), moved to Swansea and activated for the test.

| # | Check | Result |
|---|-------|--------|
| N0 | Claude's own checks: 6 new unit tests (titles, links, the detail line, London times across the clock change and 29 Feb 2028, who can be notified); full suite, typecheck and build pass | PASS (Claude: 2,031 tests) |
| N1 | 0473 proved in a rolled back transaction on Bevan: a Care Plan Review in Swansea tells S1, S2 (Email) and S3, not TM, not the Admin who completed it; a Neath one tells only S3; retries make no second row; a Supervision tells nobody until switched on for S1, then only S1; an import or history date tells nobody; a discharged service user tells nobody; a service user in hospital still does; Remove twice hides it for that person only; another person cannot Remove it; the Supervisor, a Registered Manager and a direct write are refused; a Viewer cannot be switched on; each person sees only their own; each recipient can open the record | PASS (Claude) |
| N2 | Live on Bevan after 0473 is applied: the same set up, a Care Plan Review completed through the form, the email sent once to S2, the Team Member gets nothing, a double submit makes one each, an import makes none, before and after row counts | Not tested |
| N3 | Live update: the Recent activity tile updates without a refresh | Not tested |
| N4 | Phil: Thistle, Settings, Users, a Supervisor, Notifications: "Care Plan Review completed" ticked for Recent activity, Email unticked, their branches listed | Not tested |
| N5 | Phil: Bevan as test Supervisor S1: Recent activity shows the test Care Plan Review with a Remove button | Not tested |
| N6 | Phil: the test email in the test inbox: branded, a button, no plain link | Not tested |
