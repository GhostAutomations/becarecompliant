# Test checklist: Regulation 80 (Quality of Care Review) report

Feature area: Reports > Regulation 80 reviews. Built 2026-07-30 on the proven Reg 73 engine.
Statutory basis: Regulation 80, Regulated Services (Service Providers and Responsible
Individuals) (Wales) Regulations 2017. Migration 0158. Not yet live tested.

## Walkthrough (test on deploy, single browser session)

- [ ] Reports shows a Regulation 80 card; it opens Regulation 80 reviews, a tile per branch.
- [ ] R80 Reports button top right is gold and opens the reports manager.
- [ ] Run R80 on a branch creates a pre-filled draft and opens it.
- [ ] The review section: RI name is a dropdown of branch managers and above, set to you; the
      period defaults to the last 6 months.
- [ ] The data boxes are pre-filled: staff turnover, complaints, audits, care plans and outcomes,
      supervisions and competency, training and SCW, and the previous review status.
- [ ] The incidents, safeguarding and whistleblowing boxes are present and empty for you to complete.
- [ ] Draft narrative with AI fills the tagged boxes (overview, feedback, lessons, commentary,
      overall assessment, recommendations) in gold; it does not touch incidents or safeguarding.
- [ ] Save draft turns the button green and reads "Saved", staying until you edit, then reverts.
- [ ] Refresh data updates the data boxes without wiping typed narrative.
- [ ] A survey image and a call durations image can be uploaded, previewed and removed.
- [ ] Choose a signature option (Sign now default), Save and submit jumps to the top and shows the
      Download PDF button.
- [ ] The PDF opens with every section, the pre-filled data, the AI text in black, both uploaded
      images, and the signature.

## Not tested yet: log to Final Testing (test cold)

- [ ] PREFILL ACCURACY. For a real branch the pulled figures match the site: current staffing and
      the care/office split, starters and leavers over 6 and 12 months, complaints by nature and
      category over 6 and 12 months, audit counts (staff and service user) against the monthly
      target, care plan review rate, outcomes (X of Y service users), overdue supervisions, spot
      checks, manual handling and medication competency, mandatory and safeguarding training, and
      SCW registration (X of Y not registered).
- [ ] CARE/OFFICE SPLIT. The job title heuristic classifies the branch's real roles sensibly
      (senior care workers count as care; manager, supervisor, recruitment, office as office).
- [ ] AUDIT COUNT SOURCE. The staff and service user audit counts equal the number of Audit forms
      completed in the period for that branch (evidence by record type), not the current status.
- [ ] PREVIOUS REVIEW CARRY-FORWARD. A second review for the same branch pre-fills "Did the previous
      review make recommendations" as Yes and carries the last review's recommendations into the
      status box.
- [ ] REFRESH CORRECTNESS. Change a figure on the site, Refresh data, confirm the relevant data box
      updates and the narrative and Saved state are untouched.
- [ ] PDF BODY. Dates dd/mm/yyyy, AI text black not gold, both images embedded at a sensible size,
      the printed-version note when chosen, no dashes anywhere.
- [ ] IMAGE HANDLING. A large photo is downscaled and still readable in the PDF; removing an image
      before submit leaves that section out of the PDF.
- [ ] SUBMIT VALIDATION. Submitting with no signature option, or draw/upload chosen but nothing
      captured, is blocked; printed option submits with no image.
- [ ] ROLE GATING (DB + UI). Manager can open a review read only but cannot edit; company admin,
      registered individual and registered manager can edit; team member and staff cannot reach
      /reports/reg80. RLS blocks reading or writing another company's review.
- [ ] MULTI-BRANCH ISOLATION. Running R80 for branch A versus B pulls each branch's own data.
- [ ] DELETE. Delete selected in R80 Reports removes one and several reviews, with the confirm step.
- [ ] EMPTY STATE. A branch with no staff, complaints, audits or prior review still produces a
      sensible draft (no crash, sensible "none" wording).
- [ ] AUDIT TRAIL. reg80.created, reg80.submitted, reg80.exported and reg80.deleted appear in the
      company audit log with the right actor and branch.
- [ ] STATUTORY COVERAGE. The report, once completed, contains all Regulation 80(3) review
      components and the 80(4) assessment and recommendations (spot check against the regulation).
