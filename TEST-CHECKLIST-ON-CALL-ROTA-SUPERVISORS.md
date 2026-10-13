# Test checklist: Supervisors set the On Call rota, 2026-10-13

Phil's decisions (popups): company wide rota set by Supervisors and Managers; Recruiters get the
rota and the Handover like Supervisors; the Handover otherwise unchanged; a separate "On Call: can
set the rota" tick per role in Settings, Role access, read by the database. Decisions:
`docs/decisions/on-call.md`. Migration 0450. Tests on Bevan only.

Probe key (scripts/on-call-rota-probe.sql, run as each role, all rolled back): R read, A add,
C change, X remove; own branch / other branch / company wide rota; Handover R/A/C.

| # | Check | Result |
|---|-------|--------|
| S1 | Before: every role's rota and Handover access, measured in the database | DONE (live, before 0450): Admin, RI, RM, On Call: all RACX and Handover RAC everywhere. Manager and Supervisor: own RACX, other none, company wide R only; Handover own and company wide RAC. Recruiter: own and other RACX, company wide none; Handover branches RAC, company wide none. Senior, Viewer, carer: nothing |
| S2 | After, switch on: only the approved cells change | PASS in the rolled back dry run of 0450: Manager, Supervisor and Recruiter company wide rota RACX; Recruiter company wide Handover RAC. Every other cell identical to S1 |
| S3 | After, switch off: Supervisor and Recruiter read the rota only, Handover untouched; nobody else changes | PASS in the dry run: Supervisor own R, company R; Recruiter own, other, company R; their Handover as S2; every other role as S2 |
| S4 | Every rota change audit logged with who, the cell, before and after; a save that changes nothing is not logged | PASS in the dry run: a Supervisor's add, change and remove left "Rota: ... on call", "changed from ... to ...", "... removed from ..." with the row before and after; the no change save left nothing |
| S5 | Unit tests: who opens On Call, who sets the rota by role, scope and switch | PASS (6 tests, lib/on-call/rota-access.test.ts) |
| S6 | Live probe after applying 0450 matches S2 and S3 | PASS (live, 0450 applied, advisor: no ERROR; new WARNs only the 4 helper functions signed in users must call, like the 159 already there): identical to the dry run, switch on and off |
| S7 | Bevan on a company wide rota, ZZ Test Supervisor: adds a shift, changes the person on it (moves it to someone else), clears it, and adds one in another cell | Not tested |
| S8 | The same as a Bevan Admin, unchanged | Not tested |
| S9 | The audit log shows each of S7's changes with the Supervisor's name, the cell, and before and after | Not tested |
| S10 | Settings, Role access: Supervisor tile shows "On Call: can set the rota"; unticked, the Supervisor sees the rota with no + and the database refuses a change; ticked again restores it; each switch audit logged | Not tested |
| S11 | A Viewer, Senior or carer still cannot open On Call or change the rota | Not tested |
| S12 | Phone width: the Supervisor can set a cell and read the rota | Not tested |
| S13 | Bevan back on its branch rota afterwards; the Supervisor still sets her own branch (Swansea) only | Not tested |
