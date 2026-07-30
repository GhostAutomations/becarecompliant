# Test checklist: Regulation 73 (RI branch visit) report

Feature area: Reports > Regulation 73 visits. Built 2026-07-30. Data layer reuses PQS
measures, person_check_status overdue counts, complaints, staffing and the shared PDF engine.

## Passed live (Phil, walkthrough 2026-07-30)

- [x] Run R73 on a branch creates a pre-filled draft and opens it.
- [x] "Regulation 73 visits" title, no "(RI branch visit)" suffix; card reads "Regulation 73".
- [x] RI name is a dropdown of branch managers and above, autofilled with the person logged in.
- [x] Signature defaults to "Sign now"; the three options (Sign now / Upload a saved signature /
      Sign the printed version) show only the chosen control, not all three.
- [x] Save and submit sits in the Sign off box, bottom right; no floating top bar.
- [x] Save draft turns green and reads "Saved", stays until the form is edited, then reverts to gold.
- [x] Save and submit scrolls to the top and shows the Download PDF button.
- [x] Draft narrative with AI fills the tagged boxes in gold on screen.
- [x] R73 Reports button (top right, gold) lists the reports with checkboxes; select all works.
- [x] Download selected saves the PDFs (does not open tabs).
- [x] Refresh data updates the KPI and previous-actions boxes without wiping typed narrative.

## Not tested yet: log to Final Testing (test cold)

- [ ] PREFILL ACCURACY. For a real branch, the KPI dashboard box, overdue spot-check and
      supervision counts, complaints in the last 3 months by concern type, staffing by job title,
      and the PQS rates all match the figures shown elsewhere on the site for that branch.
- [ ] PREVIOUS VISIT AUTOFILL. Run a second visit for the same branch: "Did the previous RI visit
      identify any actions" is Yes and the status box summarises the earlier visit's plan and the
      current overdue position.
- [ ] REFRESH CORRECTNESS. Change a figure on the site (complete an overdue check), Refresh data,
      confirm the KPI box reflects the new number and the narrative is untouched.
- [ ] PDF BODY. Open a submitted visit's PDF: every section and field present, dates dd/mm/yyyy,
      the drawn/uploaded signature image embedded, the "To be signed on the printed version" note
      when that option was chosen, AI text shown in BLACK (not gold), no dashes anywhere.
- [ ] SIGNATURE OPTIONS. Upload a saved image: it renders on screen and embeds in the PDF. Printed
      option: screen and PDF both show the note, no image. Draw: crisp, not pixelated.
- [ ] SUBMIT VALIDATION. Submitting with no signature option, or with draw/upload chosen but no
      signature captured, is blocked with the guidance message; printed option submits with no image.
- [ ] DELETE. Delete selected in R73 Reports removes one and several reports, with the confirm step;
      the list and any per-branch counts update.
- [ ] ROLE GATING (DB + UI). Manager can open a visit read-only but cannot edit; company admin,
      registered individual and registered manager can edit; team member and staff cannot reach
      /reports/reg73 at all. RLS blocks reading or writing another company's visit.
- [ ] MULTI-BRANCH ISOLATION. Running R73 for branch A versus branch B pulls each branch's own data;
      a visit shows only its branch, and the branch tiles list only that company's branches.
- [ ] EMPTY STATE. A branch with no staff, no complaints and no prior visit still produces a sensible
      draft (no crash, sensible "no data" wording in the boxes).
- [ ] AUDIT TRAIL. reg73.created on Run R73, reg73.submitted on submit, reg73.deleted on delete all
      appear in the company audit log with the right actor and branch.
