# Test checklist: the review's Outcomes section (2026-10-05)

Bevan first, then Thistle.

- O1 [PASS (Phil, 2026-10-05; evidence stores Review 4)] Review number is not shown on the review, from the record's Review box or from any other link; the heading says which review it is.
- O2 [PASS (seen on the evidence)] Customer Satisfaction ends with care worker feedback (not scored), then improve this service and further comments.
- O3 [PASS (seen on the evidence)] Review of Personal Plan ends with "Were any other individuals present?" and "Who?".
- O4 [PASS (Phil)] Outcomes section lists the person's active outcomes from their Outcomes page, two answers each, then "Are there any outcomes you would like to achieve that are not currently being assisted with?".
- O5 [PASS 2026-10-06: ZZ TEST Paper SU, No, submitted, no outcome created] A person with no outcomes is still asked that question; No submits with no outcome added, Yes needs the three new outcome answers.
- O5b [PASS: Settings lists 3] Customer Satisfaction no longer asks the outcomes question; Settings lists 3 scored questions.
- O6 [PASS (Phil + database: achieved, progressing with notes, new outcome with target)] Submitting logs each outcome's update on the Outcomes page with the note; Achieved moves it to Achieved; the new outcome appears with its target date.
- O7 [PASS by inspection: both unique indexes are live and the code skips a 23505; the live duplicate insert test was cancelled twice, not run] Submitting the same review twice does not log the updates or create the outcome twice.
- O8 [PASS (evidence screen reads in words)] The Evidence and PDF show the Outcomes section in words.

## Rolled out 2026-10-06 (0396, 0397)

- R1 [PASS, database] Library template v3, Thistle, Demo Care Company and Bevan all have: Customer Satisfaction with the 3 scored questions, Outcomes (personal_outcomes), others present in Review of Personal Plan.
- R2 [PASS, database] Thistle's 5 reviews in the last 6 months are still scored on the questions they asked (3 of 3 each, 100%).
- R3 [PASS, database] Demo seed: sample answers fill the Outcomes section, and the one-in-sixteen less positive review now records an unresolved issue.
