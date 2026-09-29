# Test checklist: Absence round 2 (Phil's four changes, 2026-09-29)

Test writes on Bevan Care Ltd only. Thistle is read only, except that Phil sets Thistle's own stage
actions himself as real configuration (S6).

## 4. Stage actions (migration 0334)

- S1 Bevan, Settings, Absence, Trigger points: each stage row has an "Up to and including" dropdown,
  showing Not set. Set Stage 1 Verbal warning, Stage 2 Written warning, Stage 3 Final written
  warning, Stage 4 Dismissal. Save, refresh: the four stay set.
- S2 Bevan, Settings, Letters, Absence meeting invitation: the palette has "Most the stage can lead
  to" and "What the meeting could lead to, as a sentence", and the preview shows "This is a Stage 2
  meeting and its outcome could be up to and including a written warning."
- S3 Bevan, Absence, Book meeting on someone whose level calls for a meeting: under Stage it reads
  "Up to and including: Verbal warning" (or the action for the stage shown), and changes with the
  stage.
- S4 Book it: the employee's invitation email has the "could be up to and including" sentence as its
  second paragraph. A stage with no action set sends the letter without that paragraph.
- S5 Record meeting for that person: the question reads "Warning or dismissal" with None, Verbal
  warning, Written warning, Final written warning and Dismissal, and its help lists the four stages.
  Stage 1 with Written warning is refused ("A Stage 1 meeting allows up to and including a verbal
  warning ..."), nothing is saved. Verbal warning saves, and "Warning remains live until" appears
  for it.
- S6 Thistle, Settings, Absence: Phil sets S1 Verbal warning, S2 Written warning, S3 Final written
  warning, S4 Dismissal and saves.

### Results, 2026-09-29 (Claude in Chrome, signed in as Thistle Admin)

- S1 PASS, run on Thistle as its real configuration (so also S6): the four dropdowns showed Not set,
  set to Verbal, Written, Final written, Dismissal, saved and stayed after a refresh. Database shows
  the four actions, occasions 3/4/5/6 and the six month window untouched.
- S6 PASS (as above).
- S2 PASS: both new chips on the palette; preview reads "This is a Stage 2 meeting and its outcome
  could be up to and including a written warning." Nothing saved.
- S3 PASS (display only, on Thistle, dialog closed without booking): Joan Jepkosgei, Stage 1, "Up to
  and including: Verbal warning. The invitation tells them."
- S5 part: Record meeting shows "Warning or dismissal" with the five answers and the four stage help
  lines (closed with Cancel, nothing saved; no Thistle meeting rows created). The refusal and the
  save still to run on Bevan.
- S4 still to run on Bevan (it sends the invitation).

### Results continued, on Bevan (Bev Admin login)

- Bevan actions set (Verbal, Written, Final written, Dismissal) with Stage 1 at 1 occasion; saved.
- S3 PASS on Bevan too: ZZ TEST Audit Starter, Stage 1, "Up to and including: Verbal warning".
- S4 booked 02/10/2026 10:00, Teams, Bev Admin conducting: audit shows employee and conductor
  invitations "sent". Wording to be confirmed in the +auditstart inbox (not stored by the app).
- S5 PASS: Written warning at Stage 1 refused with "A Stage 1 meeting allows up to and including a
  verbal warning under your absence settings..." and no Evidence filed; Verbal warning showed
  "Warning remains live until", saved as one Evidence (d843d837) attached to the booking
  (2bc739b1), stage 1; the discount question followed as before.
- S4 PASS (Phil, Gmail): the invitation's second paragraph reads "This is a Stage 1 meeting and its
  outcome could be up to and including a verbal warning."

Item 4: all six steps pass.

## Item 1: check the letters before they go (Book, Rearrange, Cancel)

Run on Bevan with a ZZ TEST person whose email reaches Phil. Each step: Pass / Fail / Not tested.

- L1. Book meeting, fill the details, press Check the letters. The box widens and shows "Check the
  letters", a tab for the employee and a tab for the person holding it, To, Subject, "A calendar
  invite is attached", and the whole email. Nothing is booked yet (the card still shows Book meeting).
- L2. Back returns to the details with every choice kept (stage, who, date, time, duration, place).
- L3. A detail that breaks a rule (for example a date under 48 hours, typed by hand) is refused at
  Check the letters with the usual message, before any letter is shown.
- L4. Pressing Accept the invitation inside the preview does nothing.
- L5. Approve and send books the meeting and sends both; the emails that arrive match the preview.
- L6. Cancel / rearrange, change the time, Rearrange: check the letters shows both replacement
  letters with the "replaces the earlier invitation" line. Back keeps the new time. Approve and
  send rearranges and the arrivals match.
- L7. Cancel the meeting shows both cancellation notices; nothing is cancelled until Approve and
  send, then the meeting goes and both notices arrive.
- L8. A person with no email: the employee tab says it will not be sent and why, and booking still
  works with the conductor's letter only.
- L9. On a phone width the letters are readable and the buttons reachable.

### Item 1 results (2026-09-29, Claude in Chrome, deploy e85bce5c READY)

Run on Thistle as Phil, preview only: Approve and send was never pressed. Afterwards the database
showed no new Thistle meeting rows, no absence audit entries and no emails logged.

- L1 PASS: Joan Jepkosgei, Stage 1, Phil holding, 06/10/2026 11:30, Thistle office. The box widened
  to "Check the letters", tabs "Employee: Joan Jepkosgei" and "Holding the meeting: Phil Davies",
  To, Subject "Stage 1 absence management meeting: 6 October 2026, 11:30", calendar invite note,
  and the whole email including the office address and the verbal warning sentence. The
  conductor's letter reads "You are chairing this meeting".
- L2 PASS: Back showed every choice kept (Stage 1, Phil, 06/10/2026, 11:30, 1 hour, office).
- L3 PASS: 30/09/2026 refused at Check the letters with the 48 hours message; no letters shown.
- L4 PASS: pressing Accept the invitation inside the preview did nothing.
- L9 PASS (Phil, on his phone as Bev Admin): letters readable, tabs switch, email scrolls, Approve
  and send, Back and Close all reachable.
- L5 PASS on the booking, FAIL on the box: Phil signed Chrome into Bev Admin and gave the go.
  ZZ TEST Senior given one test absence (22/09/2026) so a Stage 1 was due, then booked 07/10/2026
  10:00, Teams, Bev Admin holding. Both letters logged "sent" once each (ppdavies+senior and
  ppdavies+cob). But the box never closed: its success step refreshed the page, the refresh gave
  the box a new close function, which ran the success step again, so it refreshed without end. Tab closed to stop it. DEF-079, fixed by keeping the close
  function stable (both Book and Rearrange had it). Phil to compare the two emails with the preview.
- L6 PASS (after bdf1cd37): 14:00 shows "This meeting has been rearranged..." in yellow, Back kept
  14:00. Approve and send: the box showed "Meeting rearranged. 2 new invitations sent." and closed
  after one refresh; the card reads 7 Oct 2026 at 14:00. Both letters logged sent once.
- L7 PASS: both cancellation notices shown and nothing cancelled until Approve and send; then the
  box closed, the booking went (the card says a Stage 1 meeting is due again) and both notices
  logged sent once. Audit: booked, rearranged, cancelled.
- L5 to L7 emails PASS (checked in Resend, Phil signed in): all six Delivered, invite.ics attached to
  the four invitations; the rearranged invitation and the cancellation notice read word for word as
  their previews did.
- L8 PASS: Phil chose a test person. Add person needs an email, so ZZ TEST No Email was added on
  Bevan (Swansea, Care Assistant, login held, zz.noemail@example.com) and the email then cleared in
  Manage record (a CSV import can also leave it blank). One test absence (23/09/2026). The Employee
  tab read "ZZ TEST No Email: not sent" with the reason in amber and no email shown; Approve and
  send booked 08/10/2026 10:00 with "1 invitation sent" and closed. Audit: employee
  skipped_no_email, conductor sent. Cancel showed the same for the notice; approved, the booking
  went and only ppdavies+cob was told.

Item 1: L1 to L9 all pass (2026-09-29). Bevan test data left: ZZ TEST Senior and ZZ TEST No Email
each have one test absence and a Stage 1 due; no meetings open.

## Item 2: AI questions in Record meeting (migration 0342)

Run on Bevan as Bev Admin. ZZ TEST No Email and ZZ TEST Senior each have one test absence.

- Q1. Record meeting (nothing booked) shows a panel with the gold AI chip and "Draft questions for
  me". The form also has "Questions asked and answers" at the top of Summary of Discussion.
- Q2. Draft questions for me shows "Drafting…" at once, then a "Questions to ask" section of 5 to 8
  questions about this person's absences (Yes/No buttons, choices or boxes). The "Questions asked
  and answers" box is hidden while they are there. One AI credit used.
- Q3. Every question can be reworded or removed. None suggests an outcome or a warning, none
  guesses at a medical cause, no dashes.
- Q4. Close without saving and open Record meeting again: the same questions come straight back,
  with no second credit used.
- Q5. Answer the questions, fill the rest and Save meeting. The Evidence shows "Questions asked and
  answers" with each question and its answer.
- Q6. After saving, Record meeting for the same person starts clean (the old set is not offered).
- Q7. Book a meeting, then Record meeting on it: Draft questions for me drafts a set for that
  booking. Cancelling the booking removes its set.
- Q8. A person with a Return to Work recorded: the questions follow up on what they said there.
- Q9. On a phone, the questions are readable and answerable.
- Q10. Database probe (Claude): a Senior Care Assistant login can neither prepare nor read a set.

### Item 2 results

- Q10 PASS (2026-09-29, rolled back): as Bev Admin can_prepare true, an insert went in and was
  read back; as ZZ TEST Senior's login can_prepare false and 0 rows visible. Security advisor
  unchanged (4 WARN, 1 INFO, no ERROR). The field is on Thistle v1, Bevan v1 and the template.
- Q1 PASS: Record meeting for ZZ TEST Audit Starter (nothing booked) shows the panel with the gold
  AI chip and "Draft questions for me"; "Questions asked and answers" is in the form.
- Q2 PASS: "Drafting…" at once, then 7 questions (one a choice of three answers, the rest boxes);
  the "Questions asked and answers" box hidden while they show. One AI credit
  (absence_meeting_questions, 2,177 tokens); the set saved with no booking, as expected.
- Q3 PASS: every question has an edit box and Remove; one removed. None suggests an outcome or a
  warning or guesses a cause; no dashes. Wording read: "Can you talk me through what led to your
  two absences, on 24 and 26 September...", "Are you clear on the attendance level the company
  expects from you?".
- Q8 PASS: the questions followed up the Return to Work ("In your return to work forms you said
  work played a part in the first absence but not the second...", "you mentioned reduced hours or
  duties might help") and the Stage 1 meeting ("At your Stage 1 meeting some support was agreed").
- Q4 PASS: closed, page reloaded, reopened: the same 7 came back, no Draft button, no new usage.
- Q5 PASS: answered, Stage 2, 29/09/2026, Informal support and monitoring, saved; the discount
  question followed (answered No). The Evidence's "Questions asked and answers" holds the six
  questions with their answers; the set is closed against the new meeting and the Evidence.
- Q6 FAIL: reopening Record meeting for the same person showed last meeting's 7 questions again.
  DEF-080, fixed in form-evidence-dialog; to retest once deployed.
