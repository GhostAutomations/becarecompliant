# Test checklist: Incident form fixes, 2026-10-14

Phil's job (all companies, current and future), from Thistle: the right regulator, every answer
shown, RIDDOR, and Other in words. Migration 0467. Decision: `docs/decisions/incidents-whistleblowing.md`
("Incident form fixes from Thistle"). Test writes on Bevan only.

Run one at a time.

| # | Check | Result |
|---|-------|--------|
| I0 | Unit tests: one regulator named, never both; Other reads "Other: words"; Not recorded; RIDDOR date in the future or before the incident refused (leap day); the Other words read only from the chosen type | PASS (lib/incidents/case-display.test.ts, 6 tests) |
| I1 | Branches filled: every branch of Thistle, Bevan and Demo has its company's regulator (before and after counts shown) | PASS (before: no regulator column; after: Thistle 3 CIW, Bevan 4 CIW, Demo 4 CIW) |
| I2 | Bevan, a CIW branch, an incident: "Notifiable to CIW", "CIW Regulation 60", "CIW reference"; no CQC anywhere on the case | PASS (Bevan 3, Neath: "Notifiable to CIW", "CIW Regulation 60", the card "Notifiable to CIW"; no CQC anywhere on the page) |
| I3 | Bevan test branch set to CQC in Settings, Branches: its incident shows only CQC; set it back to CIW | PASS (Neath set to CQC in Settings, Branches: the case showed only "Notifiable to CQC" and "CQC Regulation 18", no CIW; set back to CIW, saved) |
| I4 | An old incident with no type of event (Bevan 1): What was reported shows "Type of event: Not recorded" and says no Report form is stored; the case still saves without choosing one | PASS (Bevan 1: "No Incident Report form is stored for this case", "Type of event: Not recorded", the dropdown offers Not recorded and is not required; saved without one) |
| I5 | A new Bevan report: Type of event required; every answer appears in What was reported, blanks as Not recorded | PASS (new Bevan report 4, Near miss, Llanelli: every answer in What was reported, two columns, blanks as Not recorded, signature as Signature captured) |
| I6 | RIDDOR on a Bevan case: Yes shows the date and HSE reference and the HSE link; a future date refused; a date before the incident refused; No clears them; what was typed is kept on a refusal | PASS (Bevan 3: Yes shows Date reported to HSE, HSE reference and the HSE link; 15/10/2026 refused "cannot be in the future"; 10/10/2026 refused "cannot be before the date the incident happened"; date and reference kept each time; 12/10/2026 saved; No cleared them) |
| I7 | Other: on the Report form "What type of incident was it?" appears only for Other and is required; the case title, register and What was reported read "Other: [words]"; the Incidents summary counts it under Other | PASS (Report form: the question shows only for Other, not for Fall; empty refused "What type of incident was it? (this field is required)"; saved as "Other: ZZ TEST Door alarm fault" on the title, the register and What was reported; the register's Category filter lists one Other) |
| I8 | Bevan 3 (Other, no words, filed before): reads "Other", and the case saves without words | PASS (Bevan 3 read "Other" with no words, the box was not required, and the case saved) |
| I9 | A new Bevan test branch gets the company's regulator (proved in a rolled back insert) | PASS (rolled back: a new Bevan branch got CIW; with the company set to CQC a new branch got CQC; a regulator given is kept. The database also refuses Other words on a case that is not Other, a RIDDOR date before the incident, and an HSE reference without RIDDOR Yes) |
| I10 | Incident counts on the Dashboard and the Incidents summary unchanged for Thistle, Bevan and Demo; Thistle and Demo incident rows unchanged | Database PASS (incident rows for Thistle, Bevan and Demo identical on every existing column; counts Thistle 2 open, Bevan 3 open, Demo 3 closed 1 open 1 under review, as before). Screens PASS: Thistle register 2 recorded, 2 open, as before; Bevan 4 recorded, 4 open, the one added being test report 4 |
| I11 | Phil, Thistle, open one of Thistle's incidents: What was reported shows the report's answers, "Notifiable to CIW", and nothing names CQC (look only, change nothing) | PASS (Claude in Phil's Chrome, Thistle, the 13/10/2026 Fall at Newport, looked at only: What was reported shows the report's answers and On the case; "Notifiable to CIW" and "CIW Regulation 60"; no CQC anywhere; Not recorded only on Anything to attach, RIDDOR and the outcome fields not yet filed. Thistle's incident rows unchanged after; one evidence.viewed audit row added, as designed) |
| I12 | Phone width: the What was reported card is one column and readable; the edit form's new boxes fit | PASS (Phil, phone, 2026-10-14: "Looks good") |

Note on saving: during I6 to I8, 3 of 6 saves in Claude's background Chrome tab stayed on "Saving…"
although each one was stored and the server answered normally. Re-run with Phil's Chrome open on
Bevan (2026-10-14): three saves in a row on Bevan 4, each a real change, each turned green "Saved"
and was stored. Treated as the background tab, not the form.

CORRECTION, same day: it was the form. Phil's phone stuck too after changing the time and a staff
member (both stored). Reproduced every time by changing the time. Cause: the What was reported card
read its forms inside an async component that streamed into the page late; after a save the page
waited on those late pieces for ever. Fix (commit 8dc91a79): the page reads the forms with its
other reads and the card is plain. After the fix, on Bevan 4: three time changes, the Other words
and a RIDDOR date, each turned green "Saved" and the page updated.

| I13 | After a save on the case (time, Other words, RIDDOR date), the button turns green "Saved" | PASS (Claude in Phil's Chrome after the fix, five saves) and Phil's phone PASS (time change saved 09:48, the button finished; a second or two, accepted) |
