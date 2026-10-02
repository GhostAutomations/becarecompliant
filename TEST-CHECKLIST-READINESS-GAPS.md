# Test checklist: Readiness gaps in CIW's words, and your own rating per theme (0374)

Phil, 2 Oct 2026, after reading CIW's inspection framework (May 2025, domiciliary support: three
themes, no Environment, line of enquiry 12 sufficient time) and CIW's quality of care review guidance.
Agreed by popup:
- Readiness keeps showing the evidence (19 Sep rule: the app does not predict the inspector's word).
- Each overdue gap carries CIW's own label from its impact x likelihood matrix: "Priority Action Notice
  risk" for a safety gap with nothing in place (lapsed DBS, expired Right to Work, overdue medication
  competency, MAR audits, risk assessments; safeguarding training under 50%), otherwise "Area for
  Improvement likely".
- Action in place = the check booked in the Planner (today or later), or an Update on the record linked
  to that check ("About: ...") posted on or after the day it fell due.
- The manager's own rating per theme, chosen with CIW's descriptors, set by Admin, Registered
  Individual, Registered Manager or Manager, history kept, carried into the Reg 80 report.
- New measures on Leadership and Management: Safeguarding training, Social Care Wales registration.

Test company: Thistle Care Ltd, Cardiff (live; only post test Updates on a record Phil chooses) or
Bevan Care Ltd.

RG1 PASS 2 Oct (Bevan, Llanelli): Care and Support 1 Priority Action Notice risk, Delyth Morgan medication
competency red pill, No action in place, Add action; Leadership and Management 3 Areas for Improvement
likely, safeguarding 83.3% and SCW 80% with amber pills. Snags S1 to S3 below.
RG3 PASS 2 Oct: Add action on Delyth Morgan opened her record with Updates open and About: Medication
Competency chosen; posted; the pill showed in the thread; Readiness then showed Area for Improvement likely
and "Action noted 2 Oct 2026 by Bev Admin". Snag S4 (back to the dashboard, not Readiness).
RG4 PASS 2 Oct: an unlinked Update on Dafydd Harries left his row at "Booked 5 Oct 2026".
RG5 PASS 2 Oct: the reply box had no About dropdown.
RG6 part 1 PASS 2 Oct (Neath): Osian Mathias DBS renewal row, overdue 22 Sept, red Priority Action Notice risk.
RG6 part 2 PASS 2 Oct: Add action on the DBS row opened Osian Mathias with About: DBS renewal; after posting,
the row showed "Action noted" and amber Area for Improvement likely. Snag S6.
RG8 part 1 PASS 2 Oct (Llanelli Well-being): rated Good with a note; card shows "Your rating: Good (set by Bev Admin, 2 Oct 2026)".
RG8 PASS 2 Oct: changed to Requires improvement; Rating history listed both with notes.
RG9 PASS 2 Oct: test Priority Action Notice on Llanelli Care and Support; Good refused with CIW's reason, Good kept selected; Requires significant improvement saved.
RG10 PASS 2 Oct: Neath not rated; Llanelli kept both ratings. Snag S7.
RG11 checked in code and SQL 2 Oct (page roles unchanged; cross company rating refused by RLS).
RG12 PASS 2 Oct: new Llanelli Reg 80 listed "Well-being: Requires improvement (set by Bev Admin, 2 October 2026). Testing a change" and "Care and Support: Requires significant improvement (set by Bev Admin, 2 October 2026)".
RG13 PASS 2 Oct (Llanelli pack): "CIW would likely see" column; Delyth Morgan "Area for Improvement likely, action noted 2 Oct 2026"; Dafydd Harries "Area for Improvement likely, booked 5 Oct 2026"; due soon rows blank; AI write-up names the risks and actions. Snags S8, S9.
RG14 PASS 2 Oct (Swansea, Biggest risk): named Manon Jenkins supervision, Huw Griffiths spot check, Idris Dando care plan review as Area for Improvement likely with no action in place, oldest first. Snags S10, S11.
RG15 PASS 2 Oct: Swansea at phone width, pills, No action in place and Add action wrap cleanly; rating popup readable and scrolls (checked by Claude in Chrome at 400px and by Phil).
RG2 PASS 2 Oct: Dafydd Harries supervision overdue, booked in the Planner for 5 Oct, shows Area for
Improvement likely and "Booked 5 Oct 2026".

- [x] RG1 Readiness, a theme with overdue checks: under the reason line, pills "N Priority Action Notice
  risks" (red) and/or "N Areas for Improvement likely" (amber). Open Outstanding checks: each overdue row
  has its pill, "No action in place" or the action, and an Add action button. Overdue medication
  competency shows Priority Action Notice risk; an overdue supervision shows Area for Improvement likely.
- [x] RG2 Book an overdue medication competency in the Planner for a future date, reload Readiness: the
  row says "Booked <date>" and its pill drops to Area for Improvement likely; the counts change.
- [x] RG3 Add action on an overdue row: the record opens with Updates open and "About: <check>" already
  chosen. Post a short note. Back on Readiness the row says "Action noted <today> by <you>" and a safety
  gap drops to Area for Improvement likely. The update shows an "About: <check>" pill in the thread.
- [x] RG4 An Update posted with About: nothing in particular does NOT count as an action.
- [x] RG5 A reply to an update has no About choice.
- [x] RG6 A person with a DBS renewal date in the past: the row "DBS renewal" appears under Leadership and
  Management, opens the person's record, Priority Action Notice risk; Add action offers "About: DBS
  renewal"; after posting it shows the action.
- [ ] RG7 Leadership and Management shows Safeguarding training and Social Care Wales registration
  percentages (Wales only); a measure under 85% has an Area for Improvement likely pill and the CIW line
  under the measures (for example "CIW Good: one to one supervision at least quarterly, and an annual
  review."). Safeguarding training under 50% shows Priority Action Notice risk.
- [x] RG8 Your rating: each theme shows "Your rating: not rated yet" and Rate this theme. Choose Good with
  a note: the popup shows CIW's four descriptions; after saving the card says "Your rating: Good (set by
  <you>, <date>)". Change it to Requires improvement: Rating history lists both.
- [x] RG9 A theme with an open Priority Action Notice refuses any rating but Requires significant
  improvement, with CIW's reason; the choice is kept after the refusal.
- [x] RG10 Ratings are per branch: rate Cardiff, switch branch, the other branch is not rated.
- [x] RG11 A Supervisor (or anyone below Manager) cannot open Readiness; the database refuses a rating
  from another company (checked in SQL 2 Oct: RLS refused it).
- [x] RG12 Reg 80: start or Refresh data on a review for the rated branch: the new "Rating of each theme"
  section lists each rated theme with who set it and when; the PDF includes it.
- [x] RG13 Inspection pack: the Outstanding checks table has a "CIW would likely see" column with the
  label and any action.
- [x] RG14 Readiness assistant: asking "what is the biggest risk" mentions the Priority Action Notice risks
  and whether action is in place.
- [x] RG15 Phone width: the gap rows, pills and Add action wrap cleanly; the rating popup is usable.

Checked before deploy (2 Oct, SQL as a Bevan Admin, rolled back): a linked Update and a Right to Work
Update post; an Update about another record's check is refused ("That check does not belong to this
record."); a CQC level on a CIW rating is refused; a rating for another company is refused by RLS.
Not covered: CQC companies see the action in place but no CIW labels (CQC's own enforcement terms not
agreed yet). Risk assessments, MAR audits and Right to Work as checks are only flagged if a company
has them as checks or tracker dates.

## Snagging from this pass (to build in one push after the pass, Phil 2 Oct)
- S1 Outstanding checks: keep due soon rows, and lay each row out in tidy columns: Name and check, Due,
  Planned (the Planner date, or "Not booked"). CIW pill and Add action stay on overdue rows only.
- S2 A theme whose overdue checks all have an action in place shows amber Attention, not red Action
  needed (popup: no preference, recommended option taken). Overdue with nothing in place stays red.
- S3 Remove the "CIW Good: ..." lines under the measures altogether (Phil, 2 Oct: "i think we should
  remove" them). (Checking them found the safeguarding one quoted CIW's Excellent column, LOE 6 page 39.)
- S4 Add action takes you out of Readiness: after posting the action Phil ended up on the dashboard, not back
  on Readiness. Add action must bring you back to the Readiness page (same branch) when you are done.
- S5 "Why is it late?" (Phil 2 Oct: "it depends on the note, so if the note or reason was staff member was
  on holiday or sick then the inspector may allow that for being late, or if a service user goes into
  hospital, next of kin / power of attorney is unavailable"). Agreed by popup, as described:
  - Add action asks for a reason: staff member on holiday; staff member off sick or absent; service user in
    hospital; next of kin or attorney unavailable; booked in the Planner; other. Plus the note.
  - Spotted automatically: holiday or recorded absence covering the due date shows against the gap
    (for example "On holiday 12 to 20 Sept") without anyone typing it.
  - Safety gap: a recognised reason or a booking turns it amber "Inspector's judgement: late for a recorded
    reason"; Other or no reason stays red "Priority Action Notice risk" with the note shown.
    (CIW framework paras 10 to 13: moderate impact with measures in place is the inspector's judgement,
    AFI or PAN; the framework sets no day limit and does not say what proves a measure.)
  - The reason shows on the gap row, in the inspection pack and in the Reg 80 report.
- S6 DBS renewal action asks "Date the new DBS application was submitted" (Phil 2 Oct: "only if it was enough
  time before the exp date should it alter the pill"). Popup: submitted at least 8 weeks (56 days) before the
  renewal date drops the pill to amber; later than that, or after the date, stays red with the submission
  date shown on the row.
- S7 "Your rating:" in bold white (Phil 2 Oct), on every theme card. The rest of the line stays as it is.
- S8 Inspection pack shows "Your rating: <rating>, set by <name>, <date>" under each theme heading (popup yes).
- S9 The PDF breaks words with hyphens at the end of a line ("ac-tion", "PRO-GRESSING"): switch off word
  hyphenation in the shared PDF renderer so words wrap whole (no dashes in customer copy).
- S10 The "Ask anything about your readiness" box is too wide: the Ask button and its "Thinking" sit off to the
  right, so the page looks frozen. Make the box narrower so the button and its state stay in view.
- S11 A shortcut button (Biggest risk, What needs booking, each theme) shows "Thinking..." on itself while it works.

## Snagging push (0375), tested by Claude in Chrome on Bevan (Phil, 2 Oct: "then you test in chrome")
- [ ] SN1 (S1) Outstanding checks rows: header Name and check, Due, Planned; Dafydd Harries supervision Planned 5 Oct; unbooked rows "Not booked"; DBS row Planned blank.
- [ ] SN2 (S2) Llanelli Leadership and Management (only overdue check booked) reads Attention, reason "1 check overdue, action in place".
- [ ] SN3 (S3) no "CIW Good:" lines under the measures; the amber pills stay.
- [ ] SN4 (S4) Add action, post: back on Readiness, same branch. Closing the Updates popup also goes back.
- [ ] SN5 (S5) Add action shows "Why is it late?" once About is set; a safety gap with a recognised reason shows amber "Inspector's judgement: late for a recorded reason"; Other or none stays red with the note shown; the thread shows "Late: ..."; a person on recorded holiday or absence on the due date is spotted.
- [ ] SN6 (S6) DBS action has "DBS application submitted": a date 8 weeks or more before the renewal date turns it amber; later stays red with "DBS applied <date>".
- [ ] SN7 (S7) "Your rating:" bold white.
- [ ] SN8 (S8) Inspection pack: "Your rating" first under each theme heading.
- [ ] SN9 (S9) PDFs wrap words whole, no "ac-tion".
- [ ] SN10 (S10) Ask box narrower, Ask button beside it.
- [ ] SN11 (S11) a shortcut button says Thinking while it works.
- [ ] SN12 Reg 80 new section "Overdue checks and why they are late" lists each overdue check with the label and action.
