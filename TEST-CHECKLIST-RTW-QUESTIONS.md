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
| Q1 | Bevan, 3 days cold or flu, a person with several earlier absences: 5 drafts, none mentions another absence; each has the self certification question; none asks for a fit note or whether work caused it  | PASS (ZZ RTW Test One, three earlier absences: 5 of 5; self certification in each, no fit note, no work question, nothing about another absence or month; summaries about this absence only) |
| Q2 | Bevan, 7 days exactly including a weekend: 5 drafts, self certification, no fit note  | PASS (ZZ RTW Test Two, Friday to Thursday: 5 of 5 self certification, no fit note) |
| Q3 | Bevan, 9 calendar days flu: 5 drafts, a fit note question; Yes on the employee's page asks for the upload  | PASS (ZZ RTW Test Three: 5 of 5 "Do you have a fit note for this absence?" marked for the upload, no self certification, no work question) |
| Q4 | Bevan, 5 days stress: 5 drafts, a work cause question in each  | PASS (ZZ RTW Test Four: 5 of 5 with a work cause question) |
| Q5 | Bevan, 10 days back injury: 5 drafts, a fit note question AND a work cause question  | PASS (ZZ RTW Test Five: 5 of 5 with a fit note AND a work cause question) |
| Q6 | Every draft starts with fully fit to return and ends with "Is there anything else you would like to raise?"; no support or adjustment question; no dashes  | PASS (all 25: anything else last; a fully fit to return question in each, first in 23 and later in 2 where the AI opened with "fully recovered"; no support, no dashes, no item or board). Checked by reading and by a database check, 0 problems. 29 AI calls in all: 25 counted drafts plus 4 redone after the name fix |
| Q7 | Thistle, Shannon's 10 to 12 Oct Return to Work (drafted, never sent): redrafted once under the new rules, old and new shown to Phil; Thistle's questionnaire count unchanged; no other Thistle Return to Work touched  | DONE differently, on Phil's popup: the Founder cannot run AI on a real customer, so Shannon's unsent draft was cleared (her row only, audit logged); the next Draft it for me at Thistle writes it under the new rules. Thistle questionnaires 3 to 2 (3 again when redrafted). No other Thistle Return to Work touched |
| Q8 | Phil: on Bevan, open a Return to Work, press Draft it for me, and read the questions | |
