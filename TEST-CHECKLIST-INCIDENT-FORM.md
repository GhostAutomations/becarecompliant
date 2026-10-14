# Test checklist: Incident form fixes, 2026-10-14

Phil's job (all companies, current and future), from Thistle: the right regulator, every answer
shown, RIDDOR, and Other in words. Migration 0467. Decision: `docs/decisions/incidents-whistleblowing.md`
("Incident form fixes from Thistle"). Test writes on Bevan only.

Run one at a time.

| # | Check | Result |
|---|-------|--------|
| I0 | Unit tests: one regulator named, never both; Other reads "Other: words"; Not recorded; RIDDOR date in the future or before the incident refused (leap day); the Other words read only from the chosen type | PASS (lib/incidents/case-display.test.ts, 6 tests) |
| I1 | Branches filled: every branch of Thistle, Bevan and Demo has its company's regulator (before and after counts shown) | PASS (before: no regulator column; after: Thistle 3 CIW, Bevan 4 CIW, Demo 4 CIW) |
| I2 | Bevan, a CIW branch, an incident: "Notifiable to CIW", "CIW Regulation 60", "CIW reference"; no CQC anywhere on the case | Not tested |
| I3 | Bevan test branch set to CQC in Settings, Branches: its incident shows only CQC; set it back to CIW | Not tested |
| I4 | An old incident with no type of event (Bevan 1): What was reported shows "Type of event: Not recorded" and says no Report form is stored; the case still saves without choosing one | Not tested |
| I5 | A new Bevan report: Type of event required; every answer appears in What was reported, blanks as Not recorded | Not tested |
| I6 | RIDDOR on a Bevan case: Yes shows the date and HSE reference and the HSE link; a future date refused; a date before the incident refused; No clears them; what was typed is kept on a refusal | Not tested |
| I7 | Other: on the Report form "What type of incident was it?" appears only for Other and is required; the case title, register and What was reported read "Other: [words]"; the Incidents summary counts it under Other | Not tested |
| I8 | Bevan 3 (Other, no words, filed before): reads "Other", and the case saves without words | Not tested |
| I9 | A new Bevan test branch gets the company's regulator (proved in a rolled back insert) | PASS (rolled back: a new Bevan branch got CIW; with the company set to CQC a new branch got CQC; a regulator given is kept. The database also refuses Other words on a case that is not Other, a RIDDOR date before the incident, and an HSE reference without RIDDOR Yes) |
| I10 | Incident counts on the Dashboard and the Incidents summary unchanged for Thistle, Bevan and Demo; Thistle and Demo incident rows unchanged | Database PASS (incident rows for Thistle, Bevan and Demo identical on every existing column; counts Thistle 2 open, Bevan 3 open, Demo 3 closed 1 open 1 under review, as before). Screens not yet looked at |
| I11 | Phil, Thistle, open one of Thistle's incidents: What was reported shows the report's answers, "Notifiable to CIW", and nothing names CQC (look only, change nothing) | Not tested |
| I12 | Phone width: the What was reported card is one column and readable; the edit form's new boxes fit | Not tested |
