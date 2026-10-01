# Test checklist: Getting set up card (0366)

Run as popups, one at a time: Pass / Fail / Not tested. Phase 13 rule: test now, nothing deferred.

| # | Check | Result |
|---|-------|--------|
| GS0 | DB: get_setup_status reads Thistle as the founder (14 People, 12 Service Users, 372 training, 2 managers, 0 policies, logo, CIW, Black); a Thistle Supervisor is refused both reading the status and marking a step. Unit tests 11/11. | PASS 1 Oct (Claude) |
| GS1 | Company Admin dashboard shows "Getting set up" under the welcome line, with the four groups, the count and the bar; done steps ticked green; to do steps link to their page. | |
| GS2 | "Not needed" settles a step (count goes up, grey dash); "Needed after all" puts it back. | |
| GS3 | Saving one branch in Settings > Branches ticks it: the hint then names only the branches still to save; saving the last ticks the step. | |
| GS4 | Saving a People check setting, a Service User check setting and the notification settings each tick their step. | |
| GS5 | Founder > company page shows the same ticks, folded and titled "all done" once finished. | |
| GS6 | A Manager or Supervisor never sees the card. A demo company never shows it. | |
| GS7 | When every step is done or not needed, the card leaves the Admin dashboard. | |
