# Test checklist — Phase 3 (People section)

Run as popups, one check at a time (Pass / Fail / Not tested). Anything Not tested is logged into Phase 11 (Final Testing). Run only on the deployed build (push to main green in Vercel) with migrations 0004–0024 applied (they are, ref bgrtcvyjuwopunpnudeu). Founder/Admin: ppdavies@gmail.com. Manager: Tim Mingle. A Supervisor and a Team Member are needed for the permissions section; a second company for cross-tenant.

## A. Records & scheduling on add
1. People > Add person creates a Record and you land on its page (or it appears in the register).
2. On Add person, once a Branch is picked the Line manager and Supervisors auto-fill from that branch (editable).
3. Manual Handling and Medication Competency are NOT auto-dated on add (blank until completed).
4. Probation End Due auto-fills from start date + the Probationary Period in Settings; Probation Status = Due; Spot Check Due auto-fills from start + the Spot Check days.
5. Sup 1/2/3 due and AA Next Due are NOT auto-populated on add.
6. Changing the Probationary Period in Settings does NOT retro-change existing people's probation end dates.

## B. Supervision cycle (new)
7. Each Sup 1/2/3 box has its own "Complete" button; there is no single top "Complete supervision" button.
8. Clicking Complete in Sup 2 opens a form headed "Supervision 2" with NO "Which supervision" dropdown; it records against supervision 2.
9. Sup 1 due = successful probation end + supervision interval (80 days) in year one.
10. Completing Sup 1 sets Sup 2 due = Sup 1 completion + interval; completing Sup 2 sets Sup 3 due likewise.
11. Completing Supervision 3 with the Annual Appraisal in "After Supervision 3" mode sets the appraisal due = Sup 3 completion + interval.
12. Completing the Annual Appraisal restarts the cycle: Sup 1/2/3 completed dates clear, Sup 1 due = appraisal completion + interval, and the person's overall RAG reflects the fresh cycle (not stuck red/amber).
13. After completing an "After Supervision 3" appraisal, AA Next Due is blank (it reschedules only when the next Sup 3 is completed). A "Yearly" appraisal instead self-schedules ~1 year out.

## C. The compliance loop / completion
14. Completing a check stores immutable Evidence (Evidence history shows date + author) and a branded PDF exists in the private evidence bucket (Supabase Storage).
15. Completion date = the activity date entered on the form (Date of supervision / assessment / training), NOT today. Last completed and next due both reflect the entered date.
16. The Complete and save evidence button flips to "Saving…" the instant it is clicked and stays disabled through to the redirect.
17. Completing a conditional-visibility form (probation, spot check) does NOT crash (no React error / white screen); it lands back on the record with the success note.
18. Idempotency: re-submitting the same completion does not create duplicate evidence or double-advance the due date.

## D. Trackers (DBS, Right to Work, Probation)
19. DBS / Right to Work / Probation each have their own card with a "Record" button that opens the correct tracker form.
20. Probation review form order: Outcome first; Probation end actual shows only when Outcome = Passed; Extension date shows only when Outcome = Extended; no "Probation end due" field.
21. Completing a probation form does NOT wipe the Probation End Due date.
22. Probation Extension shows as a RAG-coloured pill in the register (like other date columns), not plain text.
23. Right to Work: recording an expiry sets the RTW Expiry column; DBS records DBS / Enhanced DBS dates.

## E. Register matrix
24. Sticky Carer column (name left-aligned), all other headers/cells centred, dense rows, columns in the agreed Monday order, dates as "DD MMM YY".
25. A permanent horizontal scrollbar is visible and scrolls left/right; up/down scroll works with many rows.
26. Status, RTW Limits and Probation Status are inline colour-coded pill dropdowns that save on change.
27. Column shorthand labels set in Settings > People > Column names show in the register headers; narrower columns.
28. Branches and View (Main / Compliance Summary) dropdowns work; bold white labels, muted dropdown text.

## F. Live updates (realtime)
29. With the Admin on People (Main) and a Manager completing checks in another session, the register updates live (within ~1s) for: spot check, supervision, appraisal (check_instances) and probation (person_trackers), without manual refresh.

## G. RAG + rollups
30. A due date in the past shows red; within the amber window shows amber; else green.
31. Rollups agree: record worst-status pill, register summary counts, and Dashboard compliant/due-soon/overdue counts.

## H. Leavers / archived (exclusion everywhere)
32. Marking a leaver drops them from the register, summary and dashboard; record keeps a Leaver banner + evidence history.
33. Archive excludes the same way; Restore brings them back.

## I. Navigation / consistency
34. Every sub-page (record, complete, settings) has a clear Back link.
35. No customer-facing dashes; vocabulary is Record/Register/Check/Form/Evidence (never item/board).

## J. Permissions (RLS, not just UI) — needs Manager, Supervisor, Team Member
36. Manager sees the full register for their branch(es) only.
37. Supervisor sees only their assigned caseload (assigned via Manage record), not the whole register.
38. Team Member sees their assigned branch register READ ONLY: no Add person / Complete / Settings, cannot open a complete route directly (redirected), no service user data.
39. Evidence read tightening: a Supervisor sees evidence only for their caseload; the author always sees their own.

## K. Cross-tenant (needs a second company)
40. A user of company A cannot read company B's people, checks, or evidence.

## L. Settings
41. Settings > People sections (People checks, Probation, Column names) are collapsed by default; each Save button turns green and says "Saved".
42. Changing a check's interval (e.g. Spot Check days) recomputes the due date on existing, not-yet-completed people.
43. Annual Appraisal schedule choice (Yearly / After Supervision 3) saves and stays on the chosen value; the record card label matches.

## Results (run 2026-07-09, Admin + Manager Tim Mingle)
PASS (31): 1,3,4,5,6,7,8,9,10,11,12,13,15,16,17,18,20,21,22,24,25,26,27,28,29,31,34,35,41,42,43.
FAIL (2):
- 2: On Add person, picking a Branch did not auto-fill Line manager / Supervisors. (Investigate: likely no managers/supervisors assigned to that branch via user_branches, or a wiring bug.)
- 33: Archive works but archived records can't be seen anywhere; also the Archive option should only be offered once a person is a Leaver, not for active staff.
NOT TESTED -> logged to Final Testing (10): 14 (PDF in bucket), 19 (tracker Record cards), 23 (RTW/DBS column populate), 30 (RAG colour thresholds), 36/37/38/39 (permissions, need Manager/Supervisor/Team Member), 40 (cross-tenant, need 2nd company).

## Follow-up feature requests (Phil, 2026-07-09, during test)
- Add two new register Views: "Leavers" and "LTS & Mat Leave".
- Archive: only offer Archive once a person is a Leaver; make archived records viewable (within/alongside the Leavers view).
