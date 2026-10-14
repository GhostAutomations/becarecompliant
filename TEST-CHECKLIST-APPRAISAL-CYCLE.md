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

Not fixed, by Phil's choice: anyone else with an extra supervision before an appraisal (or fewer
than three) can show the same wrong Annual Appraisal Due and Done, because the code still counts.
