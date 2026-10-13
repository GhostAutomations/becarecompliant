# Test checklist: Outcomes, Not achieved and the past close date, 2026-10-14

Phil's job (all companies), from Thistle ticket 8. Migration 0466. Decision:
`docs/decisions/outcomes.md` (Not achieved, and the past close date). Test on Bevan only; Bevan's
past entries window is open until 27/10/2026.

Run one at a time.

| # | Check | Result |
|---|-------|--------|
| N0 | Unit tests: Not achieved closes, reopen brings it back, the close date rules (future, before it began, before the latest update, after a discharge), month ends, the leap day and the clock change keep their day, the counting rule (Not achieved in scope, not met) | PASS (lib/service-users/outcome-history.test.ts) |
| N1 | Bevan, a service user's Outcomes page: an active outcome shows Mark achieved and Mark not achieved side by side; nothing else on the card has moved | Not tested |
| N2 | Mark not achieved with the reason empty: refused, nothing typed lost | Not tested |
| N3 | Mark not achieved with a reason, past box NOT ticked: no date box; it moves to "Not achieved outcomes (1)" with a grey Not achieved pill; history shows today, the pill and the reason | Not tested |
| N4 | Mark achieved and Mark not achieved with the past box ticked: "Date it was closed" appears and is required; a future date is refused; a date before the outcome began is refused; a date before its latest update is refused | Not tested |
| N5 | A past close on a valid date (try 31/08/2026 and 25/10/2026 once it is past): history shows that date, marked as added later; the date never shifts | Not tested |
| N6 | Reopen a Not achieved outcome: back to Active outcomes, working towards; history shows Reopened | Not tested |
| N7 | The figures, with one Achieved, one Not achieved and one removed outcome added: the register, the record page percentage, readiness and the PQS figure all count Not achieved in the total but not as met, and the removed one not at all | Not tested |
| N8 | Thistle and Demo outcome percentages unchanged (33% and 93%) | Not tested |
| N9 | Phil: Thistle, Valerie's "Have my hair washed": Reopen, then Mark not achieved with the past box ticked, the real date and the reason | Not tested |
