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

- [ ] RG1 Readiness, a theme with overdue checks: under the reason line, pills "N Priority Action Notice
  risks" (red) and/or "N Areas for Improvement likely" (amber). Open Outstanding checks: each overdue row
  has its pill, "No action in place" or the action, and an Add action button. Overdue medication
  competency shows Priority Action Notice risk; an overdue supervision shows Area for Improvement likely.
- [ ] RG2 Book an overdue medication competency in the Planner for a future date, reload Readiness: the
  row says "Booked <date>" and its pill drops to Area for Improvement likely; the counts change.
- [ ] RG3 Add action on an overdue row: the record opens with Updates open and "About: <check>" already
  chosen. Post a short note. Back on Readiness the row says "Action noted <today> by <you>" and a safety
  gap drops to Area for Improvement likely. The update shows an "About: <check>" pill in the thread.
- [ ] RG4 An Update posted with About: nothing in particular does NOT count as an action.
- [ ] RG5 A reply to an update has no About choice.
- [ ] RG6 A person with a DBS renewal date in the past: the row "DBS renewal" appears under Leadership and
  Management, opens the person's record, Priority Action Notice risk; Add action offers "About: DBS
  renewal"; after posting it shows the action.
- [ ] RG7 Leadership and Management shows Safeguarding training and Social Care Wales registration
  percentages (Wales only); a measure under 85% has an Area for Improvement likely pill and the CIW line
  under the measures (for example "CIW Good: one to one supervision at least quarterly, and an annual
  review."). Safeguarding training under 50% shows Priority Action Notice risk.
- [ ] RG8 Your rating: each theme shows "Your rating: not rated yet" and Rate this theme. Choose Good with
  a note: the popup shows CIW's four descriptions; after saving the card says "Your rating: Good (set by
  <you>, <date>)". Change it to Requires improvement: Rating history lists both.
- [ ] RG9 A theme with an open Priority Action Notice refuses any rating but Requires significant
  improvement, with CIW's reason; the choice is kept after the refusal.
- [ ] RG10 Ratings are per branch: rate Cardiff, switch branch, the other branch is not rated.
- [ ] RG11 A Supervisor (or anyone below Manager) cannot open Readiness; the database refuses a rating
  from another company (checked in SQL 2 Oct: RLS refused it).
- [ ] RG12 Reg 80: start or Refresh data on a review for the rated branch: the new "Rating of each theme"
  section lists each rated theme with who set it and when; the PDF includes it.
- [ ] RG13 Inspection pack: the Outstanding checks table has a "CIW would likely see" column with the
  label and any action.
- [ ] RG14 Readiness assistant: asking "what is the biggest risk" mentions the Priority Action Notice risks
  and whether action is in place.
- [ ] RG15 Phone width: the gap rows, pills and Add action wrap cleanly; the rating popup is usable.

Checked before deploy (2 Oct, SQL as a Bevan Admin, rolled back): a linked Update and a Right to Work
Update post; an Update about another record's check is refused ("That check does not belong to this
record."); a CQC level on a CIW rating is refused; a rating for another company is refused by RLS.
Not covered: CQC companies see the action in place but no CIW labels (CQC's own enforcement terms not
agreed yet). Risk assessments, MAR audits and Right to Work as checks are only flagged if a company
has them as checks or tracker dates.
