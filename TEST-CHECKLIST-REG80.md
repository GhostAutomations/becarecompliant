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

## Verified live 2026-07-31 (DB cross-check + Chrome, Acme / Cardiff1)

- [x] PREFILL ACCURACY. Fresh SQL against the raw tables matched every pulled figure for
      Cardiff1: active staff 21, starters 6 (6m) / 8 (12m), SCW not registered 5 of 21,
      complaints 1 (12m), spot checks overdue 10, active service users 17, with outcomes 0.
- [x] CARE/OFFICE SPLIT. Works. KNOWN CAVEAT: a blank job_title falls to "office" (Cardiff1
      had 20 of 21 staff with no title). Fill job titles for a meaningful split; the RI edits
      the narrative regardless.
- [x] MULTI-BRANCH ISOLATION. A Cardiff1 review pulls only Cardiff1's counts, not the company
      total across the three branches.
- [x] DELETE. Selected a draft, confirm step, row removed and the list refreshed.
- [x] AUDIT TRAIL. reg80.created, reg80.submitted, reg80.exported and reg80.deleted all recorded
      with the right branch and actor.
- [x] PDF GENERATION. The PDF route returns a valid application/pdf (starts %PDF), 200 OK.
- [x] IMAGE HANDLING and SUBMIT VALIDATION. Confirmed by Phil live: both images embed in the
      PDF; submitting with a signature option chosen but nothing signed shows the red prompt by
      the button.

## Still to test cold (needs role logins or a manual read)

- [ ] ROLE GATING (DB + UI). Manager can open a review read only but cannot edit; company admin,
      registered individual and registered manager can edit; team member and staff cannot reach
      /reports/reg80. RLS blocks reading or writing another company's review. (Needs a login per role.)
- [ ] PREVIOUS REVIEW CARRY-FORWARD. A second review for the same branch pre-fills "Did the previous
      review make recommendations" as Yes and carries the last review's recommendations into the
      status box.
- [ ] REFRESH CORRECTNESS. Change a figure on the site, Refresh data, confirm the relevant data box
      updates and the narrative and Saved state are untouched (the Update narrative / Keep mine offer).
- [ ] PDF BODY (visual read). Dates dd/mm/yyyy, AI text black not gold, both images at a sensible
      size, the printed-version note when chosen, no dashes anywhere.
- [ ] EMPTY STATE. A branch with no staff, complaints, audits or prior review still produces a
      sensible draft (no crash, sensible "none" wording).
- [ ] STATUTORY COVERAGE. The completed report contains all Regulation 80(3) review components and
      the 80(4) assessment and recommendations (read through against the regulation).
