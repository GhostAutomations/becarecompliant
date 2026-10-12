# Test checklist: past personal outcomes and past outcome updates, 2026-10-13

Phil's decisions: `docs/decisions/historic-outcomes.md`. Migration 0449 applied; security advisor: no
ERROR, nothing new. Tests on Bevan only. Thistle is read only until Phil's go.

| # | Check | Result |
|---|-------|--------|
| H1 | Unit tests: London dates across the clock change and a leap day; From, To and update date rules; status on a past day; who counts on a past day; the outcomes PQS bands | PASS (11 tests in lib/service-users/outcome-history.test.ts; all 1864 pass) |
| H2 | The database rules, as a Bevan admin in a rolled back run: normal outcome and update still save; a past outcome and a past update save; No change saves (F83); refused: future From, To before From, From without the past tick, update before the outcome began, future update, an admin changing the window, a target before From on edit, a past outcome once the window has closed | PASS (all 13 in one run, rolled back, before applying 0449) |
| H3 | The window: Founder console sets and clears the last day; the option shows only while open and disappears after the last day | Not tested |
| H4 | Add a past outcome on Bevan (From in April, To in September): marked "Added on [today] by [name], dated [From]", From shown on the card, audit entry says so | Not tested |
| H5 | Past updates across several months, entered out of order: history lists them by their own dates, each marked as added later; the status is the latest one's | Not tested |
| H6 | A past update marked Achieved: the outcome moves to Achieved, dated that day; an earlier past update can still be added up to that day, not after it | Not tested |
| H7 | Refused on screen with the reason, and what was typed is kept: a future date, To before From, an update before From | Not tested |
| H8 | The normal (today) way of adding an outcome and an update works exactly as before | Not tested |
| H9 | PQS report for past periods shows the past entries in the right periods; the figure for a period ending today is unchanged for existing records; PDF rendered and looked at | Not tested |
| H10 | Outcomes register, Dashboard PQS tiles and Readiness: today's figures unchanged by the past entries' history | Not tested |
| H11 | A discharged service user: only past entries while the window is open, dated on or before the discharge; they stay out of today's register and figures and count in a past period before their discharge | Not tested |
| H12 | Data request export: outcomes show From and the entered later line; outcome notes show their own date and the line | Not tested |
| H13 | F83: a No change or Regressing update now changes the outcome's status | Not tested |
| H14 | Editing an outcome's title keeps its target date | Not tested |
| H15 | An Individual Plan Review filed late dates its outcome updates by the review's date | Not tested |
