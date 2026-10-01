# Test checklist: Getting set up card (0366)

Run as popups, one at a time: Pass / Fail / Not tested. Phase 13 rule: test now, nothing deferred.

| # | Check | Result |
|---|-------|--------|
| GS0 | DB: get_setup_status reads Thistle as the founder (14 People, 12 Service Users, 372 training, 2 managers, 0 policies, logo, CIW, Black); a Thistle Supervisor is refused both reading the status and marking a step. Unit tests 11/11. | PASS 1 Oct (Claude) |
| GS1 | Company Admin dashboard shows "Getting set up" under the welcome line, with the four groups, the count and the bar; done steps ticked green; to do steps link to their page. || PASS 1 Oct (Claude, Chrome, House Test in support mode): card under the heading, 2 of 13, four groups, bar. |
| GS2 | "Not needed" settles a step (count goes up, grey dash); "Needed after all" puts it back. || PASS 1 Oct: Not needed on policies took it to 3 of 13 with a grey dash; Needed after all put it back to 2 of 13. |
| GS3 | Saving one branch in Settings > Branches ticks it: the hint then names only the branches still to save; saving the last ticks the step. || PASS 1 Oct: after saving Ivy House the hint read "Still to save: Oak House, Treehouse."; all three saved gave three stamps. |
| GS4 | Saving a People check setting, a Service User check setting and the notification settings each tick their step. || PASS 1 Oct: saving Manual Handling, the Service User Audit check and the notification settings stamped checks_people, checks_service_users and notifications. |
| GS5 | Founder > company page shows the same ticks, folded and titled "all done" once finished. || PASS 1 Oct: founder page shows the same ticks; finished it reads "Getting set up: all done 13 of 13", folded. Found: its step links opened the company's Settings, which the founder cannot reach outside support mode, so the founder copy now shows the steps without links. |
| GS6 | A Manager or Supervisor never sees the card. A demo company never shows it. || PASS 1 Oct (traced and DB): the dashboard only builds the card for company_admin or platform_admin and never in a demo; a Supervisor is refused by the database (GS0). |
| GS7 | When every step is done or not needed, the card leaves the Admin dashboard. || PASS 1 Oct: with every step done or Not needed the dashboard had no card. The seven Not needed marks were then removed again; House Test keeps the genuine branch, check and notification stamps. |
| GS8 | Every step is a link to its page, ticked or not (Phil, 1 Oct). | PASS 1 Oct (Claude, House Test in support mode): all 13 steps carry a link; the ticked "Check each house" opened Settings, Houses; every other target page opened with its own heading. "Accept the agreement" sends the founder in support mode back to Founder by design; a Company Admin gets Your agreement (traced in app/agreement/page.tsx). |
