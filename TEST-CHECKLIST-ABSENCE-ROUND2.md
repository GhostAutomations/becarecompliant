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
