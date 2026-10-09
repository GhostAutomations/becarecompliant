# Test checklist: holiday changes (migration 0438, 9 Oct 2026)

Thistle's request, passed on by Phil: carers change or cancel their own holiday from the portal; the
office's changes carry a reason and reach the portal. Decisions by popup, 9 Oct 2026:
- A carer changes an APPROVED holiday: back to pending on the new dates, "Change of holiday".
  Declined: the dates first agreed come back.
- A carer asks to cancel an APPROVED holiday: pending, "Cancellation request". Declined: stays booked.
- Carers change or cancel only BEFORE the holiday starts. From its first day, only the office.
- A reason is required for every change and every cancel, by anyone.
- The office's changes show at the top of the carer's portal until Got it, as well as the email.

Test on Bevan (writes), never on Thistle. Carer login for the portal tests: the Bevan test carer
(ZZ TEST Audit Starter, Swansea). Bevan's emails are muted, so check emails in notification_log.

## Office (Holiday page)
1. Edit dates on a holiday asks for a reason; it will not save without one.
2. Saved with a reason: the dates change, and the carer's portal shows "Your holiday dates have
   changed" with both sets of dates, the reason, who and when, until Got it.
3. Cancel asks for a reason; the carer's portal shows "Your holiday has been cancelled".
4. A carer's Change of holiday shows in Pending requests with the label, the agreed dates and the reason.
5. Approve it: approved on the new dates; the carer sees "Your change of holiday is approved".
6. Decline it (reason required): back to approved on the agreed dates; the carer sees "declined".
7. A Cancellation request: Approve cancels it; Decline keeps it booked; the carer is told either way.

## Portal (carer)
8. An approved holiday that has not started shows Change dates and Ask to cancel.
9. Change dates: earliest date is tomorrow, a reason is required, and the panel says it goes back
   for approval. After sending: "Change waiting for approval" and "Agreed before" with the old dates.
10. Take back my change (reason): back to Approved on the agreed dates.
11. Ask to cancel (reason): "Cancellation waiting for approval". Keep my holiday puts it back.
12. A request not yet decided: Change dates keeps it waiting and tells the manager; Withdraw
    (reason) cancels it.
13. On or after the first day of the holiday: no buttons, "This holiday has started" instead.
14. A notice's Got it removes it and it does not come back.
15. The "View your holidays" button in a carer's email opens My area, not the office Holiday page.

## Rules the database holds (probed with each role)
16. A carer cannot change or cancel someone else's holiday, or their own once it has started,
    or without a reason.
17. Nobody without holiday rights can edit or cancel through the office functions.
18. A Branch Manager cannot decide or change a holiday in a branch they do not manage.

## Results
- 9 Oct, database (commit 504e5983, migration 0438 applied by Phil): probed as the test carer and the
  Bevan Admin inside transactions rolled back afterwards. PASS 16: a carer is refused on someone
  else's holiday, on their own once started, without a reason, on the office functions, and approving
  their own. PASS the whole cycle: change of an approved holiday goes to pending with the agreed dates
  kept; decline needs a reason and puts the agreed dates and approver back; ask to cancel, take it
  back, ask again, approve: cancelled with the carer's reason; an ordinary approve writes no history;
  notices only for the office's decisions; Got it clears one; a carer sees no other person's history.
- PASS 1 (live, Chrome, Bevan Admin): Edit dates refused to save with no reason ("Please fill in this
  field"); with a reason the dates moved and the history row holds the reason (Rhodri Evans, test).
- PASS 3 (live): Cancel with a reason cancelled it and recorded the reason.
- NOT RUN, by Phil's decision on 9 Oct ("let Thistle run with it"): 2, 4 to 15, the portal screens and
  the office's decisions on a carer's change. Thistle uses it live and flags any problem. The rules
  underneath them are proven by the database probes above; the screens themselves are not.
- Not testable on Bevan today: 18 (no active Branch Manager login); the rule is the same function as
  approving, which was probed in August.

## Calendar names open the holiday (9 Oct 2026)
Charlotte at Thistle clicked a booked holiday on the calendar and nothing happened; the buttons
were only in "Booked, still to come". Phil chose: a name on the calendar opens that holiday.
12. Clicking a name opens a popup with the status, branch, dates, back at work date, reason and
    clashes.
13. For someone who may decide it: an approved holiday still to come shows Edit dates and Cancel
    (each asks for a reason); a pending one shows Approve, Decline, Edit dates and Cancel.
14. After Cancel the popup shows Cancelled with the reason and no buttons; after Edit dates it
    shows the new dates. A holiday already over shows "Taken" with no buttons.
15. A Supervisor (cannot decide) sees the details only.

Run by Claude on 9 Oct 2026 after the deploy of 2fc99aba was READY, in Bevan as Bev Admin, on a
ZZ TEST holiday booked for Rhodri Evans (20 to 22 Oct 2026).
- 12 PASS. Clicking "Rhodri" on the calendar opened "Holiday: Rhodri Evans": Approved, Llanelli,
  20 Oct 2026 to 22 Oct 2026, Back at work 23 Oct 2026, with Edit dates and Cancel.
- 13 PASS for an approved holiday. Edit dates took a reason and saved 20 to 23 Oct; the popup
  showed the new dates. Pending not run live (none in Bevan).
- 14 PASS. Cancel with a reason: the popup showed Cancelled and the reason with no buttons, and
  the name left the calendar.
- 15 Not run live (signed in as Bev Admin only); the buttons are offered by the same canDecide
  rule as the lists.
- Found: editing the dates leaves the "Back at work" date as it was (here 23 Oct, now the last
  day of the holiday). This was already so before today, for office edits and carers' changes.

## Back at work goes with the dates (migration 0440, 9 Oct 2026)
Phil chose: ask for it with the new dates. Until now the Back at work date was only ever the
answer on the original form, so it never moved with the dates.
16. Edit dates (office) shows From, To and Back at work; Back at work starts as the date the
    holiday has (if still after the last day) or the day after the new last day, and follows To
    until typed over. A date on or before the last day is refused.
17. Saved: the Holiday page and the calendar popup show the new Back at work date.
18. A carer's Change dates in the portal has the same box. Declined or taken back: the agreed Back
    at work date comes back with the agreed dates.
19. Holidays booked before today still show the date from their form.

Run by Claude on 9 Oct 2026 after the deploy of 6f52b615 (migration 0440 confirmed applied).
- Database probes (rolled back, as the Bevan carer login and Bev Admin): a Back at work date on
  the last day is refused; a carer's change stores its Back at work and remembers the agreed one;
  declined, the dates and the form's Back at work come back; an office edit with no date gives
  the day after the end, with a date keeps it; a change taken back restores the agreed date.
- 16 and 17 PASS live: Edit dates on Rhodri's ZZ TEST holiday showed Back at work 23 Oct; moving
  To to 23 Oct moved it to 24 Oct by itself; saved, the popup shows "Back at work 24 Oct 2026".
- 18 portal screen not run live (no carer login used); covered by the probes.
- 19 PASS: holidays booked before today still show their form's date (Taiye's at Thistle: 22 Nov).

## Edit dates on a pending request (9 Oct 2026, Charlotte at Thistle)
Her edit saved (Taiye's request moved to 18 to 19 Nov at 12:55) but the box stayed open, so it
looked as if nothing happened, and the request stayed pending. Fixed and decided by popup:
20. After Save dates the box closes and the new dates show (office Edit dates and the carer's
    Change dates).
21. A pending request's edit box has Save dates (stays pending) and Save and approve (books it
    on the new dates, the approval email goes with the new dates, no separate "changed" email).
22. The Pending requests and Booked rows stay one line: Edit dates, Decline and Cancel open the
    holiday's popup (dates at the top, the form under them) instead of unfolding inside the row
    (Phil, 9 Oct: "it cannot be that big"). Approve stays one click in the row.

Run by Claude on 9 Oct 2026 after the deploy of 780bfdbb, in Bevan as Bev Admin, on Rhodri's
ZZ TEST holiday (put back to pending for the test).
- Pending row (before this deploy): Edit dates saved 21 to 24 Oct and the row's line updated
  within 3 seconds, but the open form filled the row: this is what Charlotte saw.
- 22 PASS. The Pending row stays 60px; Edit dates opened the popup with the dates at the top and
  Save dates, Save and approve and Cancel under them.
- 21 PASS. Save and approve on 22 to 24 Oct: the popup showed Approved, 22 Oct to 24 Oct 2026,
  Back at work 25 Oct; Pending requests (0), Booked (1). Audit: amended (then_approve, no
  "changed" email) then "Holiday request approved".
- 20 PASS. The form closed itself after the save, leaving Edit dates and Cancel.
- Cancel from the Booked row opened the popup straight onto the reason; cancelled with a reason,
  the popup showed Cancelled and the reason. The test holiday is now cancelled.
