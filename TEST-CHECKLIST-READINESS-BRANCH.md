# Test checklist: Inspection Readiness per branch (0363)

Phil, 1 Oct 2026, after Thistle's CIW reports: Cardiff and Gwent are inspected and rated as separate
services. Agreed by popup: readiness per registered branch; dashboard tile one line per branch with
a section of cards like the PQS report; a branch picker on Readiness; each branch's last inspection
with the rating per theme; notices recorded against the branch; a "Registered with CIW as its own
service" tick per branch, on by default, the office off.

Test company: House Test Ltd (three houses: Ivy House, Oak House, Treehouse; word Houses).

- [ ] RB1 Settings, Houses: each house shows "Registered with CIW as its own service" ticked, the office unticked. Untick and save one, tick it back: saved, kept on reload.
- [ ] RB2 Readiness: a button per registered house; the first is chosen; "Showing <house>. CIW inspects and rates each registered house on its own." Pressing another shows that house's figures.
- [ ] RB3 Unticking a house in Settings removes its button on Readiness and its line on the dashboard.
- [ ] RB4 Record an inspection for one house: date, published date, Well-being Good, Care and Support Requires improvement, Leadership and Management left Not rated. Saved; the panel shows the date and two rating pills; each theme card says "Rated ... at the last inspection".
- [ ] RB5 Refused save keeps what was typed: published date before the inspection date is refused, every field kept.
- [ ] RB6 Record a notice on one house: it shows under that house only, not under another.
- [ ] RB7 Dashboard: the CIW readiness tile has one line per house with its weakest status, each opening that house; below the PQS report a "CIW readiness" section with a white card per house, its three themes and "Last inspected ..." or "No inspection recorded yet".
- [ ] RB8 Inspection pack from a house: the cover says Service: <house>, the file is named after it, and the figures match that house's page.
- [ ] RB9 Readiness assistant on a house answers about that house (the question names it).
- [ ] RB10 A company with no registered branch (untick all): Readiness shows every branch together with the amber note to tick them in Settings; the dashboard tile goes back to the three themes.
