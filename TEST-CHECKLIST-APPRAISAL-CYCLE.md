# Test checklist: Annual Appraisal columns, 2026-10-14

Thistle, Newport: one carer (record `dacdb8b3-2df4-40da-af4d-15f171ad0003`) showed Annual Appraisal
Due 05/09/2026 in red and Annual Appraisal Done blank, after an appraisal on 29/03/2026.

Cause: the appraisal columns count supervisions (three per appraisal) instead of splitting on the
appraisal date the way the supervision columns do. Her record held two ad hoc supervisions
(13/05/2025 and 20/10/2025), so five supervisions came before the appraisal and the count put her
current cycle in the wrong place.

Phil's choice (popup, 2026-10-14): remove the two ad hoc supervisions from her record, no code
change. Both were imported completions (`migrated_completions`), not Evidence. Thistle's imported
completions went from 733 to 731; nothing else changed in any company.

| # | Check | Result |
|---|-------|--------|
| A0 | Claude's own checks: all 145 people at Thistle, Bevan and Demo recalculated before and after; only this carer's values changed; Supervisions 1 to 3 unchanged for everyone; row counts unchanged except the two deleted rows | PASS (Claude) |
| A1 | Thistle, People, Compliance, Newport: the row and the record show Supervision 1 done 17/06/2026, Supervision 2 done 05/09/2026, Supervision 3 due 24/11/2026 (green), Annual Appraisal Done 29/03/2026 (green), Annual Appraisal Due blank | PASS (Phil, 2026-10-14) |

## Part 2: the code fix (THE LIST 58, Phil's popup 2026-10-14, before the Office matrix job)

The appraisal columns now split the cycle on the last appraisal's date, like the supervision
columns (`lib/people/appraisal-cycle.ts`, re-exported from logic.ts so every caller is unchanged).
A finished appraisal is judged against the last supervision before it plus the interval.

Bevan test record: "ZZ Appraisal Test", Llanelli, with the original seven supervisions (two ad
hoc) and an appraisal on 29/03/2026, entered through seed_migrated_completion.

| # | Check | Result |
|---|-------|--------|
| A2 | Claude's own checks: 9 new unit tests; full suite 1,987 pass, typecheck and build pass; the old code on ZZ Appraisal Test gives Due 05/09/2026 red and Done blank, the new code gives Due blank and Done 29/03/2026 green; all 145 people recalculated: Supervisions 1 to 3 unchanged for everyone, Annual Appraisal changes only for the 11 people listed to Phil (Done colour), backfill unchanged | PASS (Claude) |
| A3 | Bevan, People, Compliance, Llanelli: ZZ Appraisal Test shows Supervision 1 done 17/06/2026, Supervision 2 done 05/09/2026, Supervision 3 due 24/11/2026, Annual Appraisal Done 29/03/2026 green, Annual Appraisal Due blank; the same on the record | Not tested |
| A4 | Thistle, People, Compliance, Newport: one person from the list whose appraisal was done after its due date now shows the Annual Appraisal Done date in amber (done late); their Supervision 1 to 3 cells are unchanged | Not tested |
