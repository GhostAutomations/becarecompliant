# Test checklist: DBS and Right to Work on Add a person, 2026-10-15

Phil's job. Migration 0485. Decision: `docs/decisions/add-person-documents.md`. Baseline: Add a person
436 ms, register 728 ms, record 922 ms (median of 5), save 1.95 s; a new person had 9 checks, probation
due, no DBS or RTW, no Evidence, audit person.created.

| # | Check | Result |
|---|-------|--------|
| A0 | Unit tests: DBS one or the other (details, tick, both, neither, blanks), RTW required, recipients once each, the form token, the record notice words | PASS (lib/people/add-person-docs.test.ts, 6) |
| A1 | Rolled back proof of 0485: every person identical apart from the new empty column; a second person with the same token refused (23505); people without a token unaffected | PASS (before applying) |
| A2 | Bevan: add a person with DBS details and Right to Work: DBS and RTW cards filled, two Evidence rows (form version, author, time), audit person.created and two person.tracker_form_completed, register row | |
| A3 | Bevan: add a person with "No DBS yet": the email reaches the adder and line manager, its button opens that person's DBS Pending Risk Assessment, the DBS card is red | |
| A4 | Bevan: save with neither: refused, plain words, nothing typed lost, nobody added | |
| A5 | Bevan: double click Add person: one person, one set of Evidence, one email | |
| A6 | Bevan: with "They already work here" ticked: no DBS or RTW boxes in the panel; probation and history saved as before | |
| A7 | Phone width: the sections stack, canonical controls | |
| A8 | Timings after: Add a person, register and record no slower than the baseline; the save measured | |
| A9 | Phil: Bevan Add a person, the sections, the one or the other rule, the error with neither | |
| A10 | Phil: the risk assessment email in the inbox, with its button | |
| A11 | Phil: a test person's record, DBS and Right to Work cards filled from Add a person | |
