# Test checklist: absence stages for every company, folded and cancellable Return to Work, 2026-10-13

Phil's job: Part A (stage counting and the bracketed popup, all companies, no switch) and Part B
(Return to Work folded, cancel and reinstate, Thistle's backlog). Migration 0459. Decision:
`docs/decisions/absence-stage-history.md`. Earlier checks for the popup and stages:
TEST-CHECKLIST-ABSENCE-BRACKET.md (all passed).

Run one at a time. Bevan as Bev Admin unless the step says otherwise. Absence page: People, Absence.

| # | Check | Result |
|---|-------|--------|
| R0 | Rolled back proof of 0459 on Bevan: Supervisor refused (cancel, reinstate, direct edit); short reason refused; Bev Admin cancels two; again says already; a batch with a recorded one refused whole; direct edit refused; reinstate, then "not cancelled"; audit written; absences and meetings unchanged | PASS (2026-10-13, before applying) |
| R1 | Absence page: the Return to Work section starts folded; heading reads "Return to Work · [12 overdue]" in a red pill; nothing else on the page has moved | |
| R2 | Click the heading: it opens and closes; with the keyboard (Tab to it, Enter) too; on a phone too | |
| R3 | Cancel one: Cancel on one row, try saving with no reason (refused, the box keeps what is typed), then a reason: it leaves the list and the count drops to 11 | |
| R4 | Cancel several: tick three rows, Cancel ticked, give a reason: all three leave, the count drops by three | |
| R5 | View absence on that person: the absence shows "Return to Work cancelled" with who, when and why; Reinstate puts it back on the list and the count goes up | |
| R6 | Dashboard: Return to works due drops by the number cancelled | |
| R7 | Absence stages unchanged by cancelling: ZZ Absence Test A still "Stage 1 Due · Stage 2 Due" after its Return to Works are cancelled | |
| R8 | A recorded Return to Work cannot be cancelled (database refusal, proved in R0 and again live) | |
| R9 | A live questions link closes: a sent link for a cancelled Return to Work shows "Your manager has cancelled this Return to Work", and answers cannot be sent | |
| R10 | A Supervisor sees no Cancel or tick boxes, and the database refuses them (R0) | |
| R11 | Empty state: with none outstanding the heading reads "Return to Work · none outstanding" and still opens | |
| R12 | Thistle backlog (on Phil's go, after deploy): the 12 listed cancelled with "Backlog cleared at Thistle's request, 13 Oct 2026" as the Founder; overdue 12 to 0, due 7 to 7, absences and meetings unchanged, every Thistle person's stages unchanged | |
| R13 | Demo: absence stages now use the stage history (only Demo changes); Bevan and Thistle unchanged | |
| R14 | Phil, on Thistle: open Joan's View absence. Her absences show, with 1 to 7 Apr and 1 Oct Discounted, no bracket (no stage open: two absences count), and her 16 Oct Stage 1 booking on her card | |
