# Test checklist: DBS date of issue and calculated Enhanced DBS (2026-10-05)

Phil: "change the label so it says DBS date of issue" and Enhanced DBS calculated. Agreed by popup: fills in as issue date + 3 years exactly, still editable, blanks backfilled.
Migration 0386 applied (DBS form v2 for Thistle and Bevan, v1 relabelled for Demo; 50 Demo blanks filled, no real company had any).

| # | Check | Result |
|---|-------|--------|
| D1 | Record page DBS card reads "DBS date of issue" and "Enhanced DBS" | NOT TESTED |
| D2 | People register column header reads "DBS date of issue" | NOT TESTED |
| D3 | DBS form: question reads "DBS date of issue"; typing 12/05/2024 fills Enhanced DBS with 12/05/2027 | PASS 2026-10-05 (Bevan: 03/10/2026 filled 03/10/2029, saved to the record) |
| D4 | DBS form: change the issue date, Enhanced DBS follows; type your own Enhanced DBS, then change the issue date, yours stays | NOT TESTED |
| D5 | DBS form: save; record shows both dates; the Evidence shows the Enhanced DBS date and form version 2 | NOT TESTED |
| D6 | Add a person, They already work here: DBS date of issue fills Enhanced DBS; saved record has both | NOT TESTED |
| D7 | Import: a file with header "DBS" (old template) still reads; a row with only the issue date previews and imports with Enhanced DBS = issue + 3 years | NOT TESTED |
| D8 | Downloaded People import template header reads "DBS date of issue" | NOT TESTED |
| D9 | Issue date 29/02/2024 gives Enhanced DBS 28/02/2027 (unit tested, check once on screen) | NOT TESTED |
