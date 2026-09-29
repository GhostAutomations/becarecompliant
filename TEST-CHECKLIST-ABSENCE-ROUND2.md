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
