# Test checklist: Inspection Readiness per branch (0363)

Phil, 1 Oct 2026, after Thistle's CIW reports: Cardiff and Gwent are inspected and rated as separate
services. Agreed by popup: readiness per registered branch; dashboard tile one line per branch with
a section of cards like the PQS report; a branch picker on Readiness; each branch's last inspection
with the rating per theme; notices recorded against the branch; a "Registered with CIW as its own
service" tick per branch, on by default, the office off.

Test company: House Test Ltd (three houses: Ivy House, Oak House, Treehouse; word Houses).

- [x] RB1 Settings, Houses: each house shows "Registered with CIW as its own service" ticked, the office unticked. Untick and save one, tick it back: saved, kept on reload.
  PASS 1 Oct (House Test Ltd): office unticked, three houses ticked; Oak House unticked and saved, still unticked on reload; ticked back.
- [x] RB2 Readiness: a button per registered house; the first is chosen; "Showing <house>. CIW inspects and rates each registered house on its own." Pressing another shows that house's figures.
  PASS 1 Oct: buttons Ivy House and Treehouse (Oak unticked at the time), Ivy chosen first, "Showing Ivy House. CIW inspects and rates each registered house on its own."; Treehouse showed its own figures.
- [x] RB3 Unticking a house in Settings removes its button on Readiness and its line on the dashboard.
  PASS 1 Oct: with Oak House unticked, no Oak button on Readiness and no Oak line or card on the dashboard.
- [x] RB4 Record an inspection for one house: date, published date, Well-being Good, Care and Support Requires improvement, Leadership and Management left Not rated. Saved; the panel shows the date and two rating pills; each theme card says "Rated ... at the last inspection".
  PASS 1 Oct (Ivy House): inspected 14 Jan 2025, published 6 Mar 2025, Well-being Good, Leadership and Management Requires improvement; panel showed both pills and the notes; each theme card "Rated ... at the last inspection, 14 Jan 2025".
- [x] RB5 Refused save keeps what was typed: published date before the inspection date is refused, every field kept.
  PASS 1 Oct: published 10 Jan 2025 before the 14 Jan inspection refused ("The report cannot be published before the inspection."), every field and the notes kept.
- [x] RB6 Record a notice on one house: it shows under that house only, not under another.
  PASS 1 Oct: Area for Improvement under Leadership and Management on Ivy House; Ivy shows it and turns that theme Attention, Treehouse shows "No notices recorded." Found: the theme card said "1 Area for Improvement open" twice (reason line and notices line); fixed, rechecked live after deploy: said once.
- [x] RB7 Dashboard: the CIW readiness tile has one line per house with its weakest status, each opening that house; below the PQS report a "CIW readiness" section with a white card per house, its three themes and "Last inspected ..." or "No inspection recorded yet".
  PASS 1 Oct: tile "Ivy House Attention, Treehouse Not started"; CIW readiness section below the PQS report with a white card per house and "Last inspected 14 Jan 2025: Well-being Good, Leadership and Management Requires improvement" / "No inspection recorded yet".
- [ ] RB8 Inspection pack from a house: the cover says Service: <house>, the file is named after it, and the figures match that house's page.
  Not run by Claude: the pack downloads a file to your computer. Code traced: the button passes ?branch=, the pack reads that branch, adds Service: <house> to the cover and names the file after it.
- [ ] RB9 Readiness assistant on a house answers about that house (the question names it).
  Could not run in support mode: the founder is not a company member, so AI is refused (DEF-103, the message said "out of AI credits" with 25 left; fixed and rechecked: it now says AI is switched off in support mode). Code traced: the question and narrative are passed the branch and the context names the service. To try as a company login.
- [x] RB10 A company with no registered branch (untick all): Readiness shows every branch together with the amber note to tick them in Settings; the dashboard tile goes back to the three themes.
  PASS 1 Oct: all three unticked, Readiness showed every house together with the amber note, the dashboard section went and the tile showed the themes; all three ticked back and saved.
