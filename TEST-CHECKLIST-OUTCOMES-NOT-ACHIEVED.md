# Test checklist: Outcomes, Not achieved and the past close date, 2026-10-14

Phil's job (all companies), from Thistle ticket 8. Migration 0466. Decision:
`docs/decisions/outcomes.md` (Not achieved, and the past close date). Test on Bevan only; Bevan's
past entries window is open until 27/10/2026.

Run one at a time.

| # | Check | Result |
|---|-------|--------|
| N0 | Unit tests: Not achieved closes, reopen brings it back, the close date rules (future, before it began, before the latest update, after a discharge), month ends, the leap day and the clock change keep their day, the counting rule (Not achieved in scope, not met) | PASS (lib/service-users/outcome-history.test.ts) |
| N1 | Bevan, a service user's Outcomes page: an active outcome shows Mark achieved and Mark not achieved side by side; nothing else on the card has moved | PASS (Bevan admin, ZZ TEST Filing SU: every active card shows Log update, Mark achieved, Mark not achieved, Edit, Remove) |
| N2 | Mark not achieved with the reason empty: refused, nothing typed lost | PASS ("Please fill in this field."; the form stayed open) |
| N3 | Mark not achieved with a reason, past box NOT ticked: no date box; it moves to "Not achieved outcomes (1)" with a grey Not achieved pill; history shows today, the pill and the reason | PASS (reason "Health declined", no date box without the past box; moved to "Not achieved outcomes (1)", grey Not achieved pill; history "14/10/2026 Not achieved ... Health declined"; Reopen offered) |
| N4 | Mark achieved and Mark not achieved with the past box ticked: "Date it was closed" appears and is required; a future date is refused; a date before the outcome began is refused; a date before its latest update is refused | PASS (Not achieved on a past outcome begun 01/08/2026 with an update dated 15/09/2026: the date box shows only when ticked, required, browser limits 15/09/2026 to today; with those lifted the server refused 31/07/2026 "The outcome began on 01/08/2026, so it cannot be closed before then.", 01/09/2026 "The outcome has an update dated 15/09/2026, so it cannot be closed before then.", 15/10/2026 "The date it was closed cannot be in the future."; the reason typed kept each time. Mark achieved with the past box: the same date box, the note optional, closed on 14/10/2026) |
| N5 | A past close on a valid date (try 31/08/2026 and 25/10/2026 once it is past): history shows that date, marked as added later; the date never shifts | PASS (closed 30/09/2026, a month end: dated_on 30/09/2026, achieved_at midday, history "Added on 14/10/2026 by Bev Admin, dated 30/09/2026"; a close at 00:29 London on 14/10, still 13/10 in UTC, reads 14/10/2026. 25/10/2026 is proven by the unit tests until that date has passed) |
| N6 | Reopen a Not achieved outcome: back to Active outcomes, working towards; history shows Reopened | PASS (Reopen on the Not achieved outcome: back in Active outcomes as Working towards) |
| N7 | The figures, with one Achieved, one Not achieved and one removed outcome added: the register, the record page percentage, readiness and the PQS figure all count Not achieved in the total but not as met, and the removed one not at all | PASS (one Achieved, one Not achieved, one Working towards, one removed: the record reads 33% (1 of 3); the register 81%, 38 tracked, 31 achieving or progressing, from 85% (30 of 35) before; readiness and the PQS read the same register) |
| N8 | Thistle and Demo outcome percentages unchanged (33% and 93%) | PASS (Thistle 33%, 1 of 3; Demo 93%, 93 of 100; both unchanged) |
| N9 | Phil: Thistle, Valerie's "Have my hair washed": Reopen, then Mark not achieved with the past box ticked, the real date and the reason | Not tested |
| N10 | Outcome cards two across on a laptop screen (Active, Achieved, Not achieved), one per row on a phone; the same content in each card | Laptop PASS (Bevan, three active outcomes: two per row, buttons fit, no sideways scroll at 1280 wide). Phone PASS (Phil) |
