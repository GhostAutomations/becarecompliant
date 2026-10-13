# Test checklist: Return to Work AI questions about THIS absence only, 2026-10-13

Phil's job after a Thistle draft for a three day cold asked for a fit note, whether work caused it,
and about the person's April and June absences. Rules A to F; the code check in
`lib/absence/rtw-draft-rules.ts` runs on every draft before it is saved or shown. Stage meeting AI
questions are untouched. No migration, no new form version (the published form has no fixed fit
note or work related field). The support question stays out (Phil, 8 Oct, confirmed 13 Oct).
Decision: `docs/decisions/rtw-ai-questions.md`.

Run one at a time.

| # | Check | Result |
|---|-------|--------|
| Q0 | Unit tests: the Thistle draft word for word (four bad questions removed, self certification added), calendar days (weekends, clock change, leap year), 7 v 8 days, rule D reasons, rule A (other months, dates, earlier, pattern, stage, trigger; the absence's own month and dates allowed; "May I ask" allowed), rule E order and the question limit, no dashes, the summary, and the AI input holding this absence only | PASS (lib/absence/rtw-draft-rules.test.ts, 15) |
| Q1 | Bevan, 3 days cold or flu, a person with several earlier absences: 5 drafts, none mentions another absence; each has the self certification question; none asks for a fit note or whether work caused it | |
| Q2 | Bevan, 7 days exactly including a weekend: 5 drafts, self certification, no fit note | |
| Q3 | Bevan, 9 calendar days flu: 5 drafts, a fit note question; Yes on the employee's page asks for the upload | |
| Q4 | Bevan, 5 days stress: 5 drafts, a work cause question in each | |
| Q5 | Bevan, 10 days back injury: 5 drafts, a fit note question AND a work cause question | |
| Q6 | Every draft starts with fully fit to return and ends with "Is there anything else you would like to raise?"; no support or adjustment question; no dashes | |
| Q7 | Thistle, Shannon's 10 to 12 Oct Return to Work (drafted, never sent): redrafted once under the new rules, old and new shown to Phil; Thistle's questionnaire count unchanged; no other Thistle Return to Work touched | |
| Q8 | Phil: on Bevan, open a Return to Work, press Draft it for me, and read the questions | |
