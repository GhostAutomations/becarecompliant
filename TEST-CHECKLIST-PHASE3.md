# Test checklist — Phase 3 (People section)

Run as popups, one check at a time (Pass / Fail / Not tested). Anything Not tested
is logged into Phase 11 (Final Testing). Only run once the code is deployed (push
to main is green in Vercel) and migration 0004 is applied (it is, to ref
bgrtcvyjuwopunpnudeu). Test tenant: Thistle Care Wales (12 forms, 8 People checks,
0 people). Admin login: ppdavies@gmail.com. Team Member: ficklephil@me.com.

## Recurrence engine (already unit-tested, 19/19 in sandbox)
1. `npm test` passes locally on your machine (node --experimental-strip-types).

## Records
2. Add person: People > Add person creates a Record; you land on the record page.
3. On create, the 8 People checks are auto-applied (record shows 8 check cards).
4. Completion-anchor checks (supervision, appraisal, spot check, competency,
   manual handling, DBS) get an initial due = start date + interval; expiry checks
   (right to work) show "On record" / N/A until a date is captured; probation is a
   one-off due start + 3 months.
5. Edit details saves (name, job title, team, start date, manager, team leader).
6. Transfer to another branch moves the record and its check branch follows.

## The compliance loop (the heart of Phase 3)
7. Complete a Supervision: the shared Form renders, validates, and on submit
   returns to the record with a success note.
8. After completing, the Supervision check flips to green, "Last completed" shows
   today, and "Next due" is today + 3 months (Europe/London).
9. Evidence history shows the new entry (date + author); a branded PDF exists in
   the private evidence bucket (verify in Supabase Storage).
10. Right to Work: complete it with a visa expiry date; next due = expiry − 30 days
    (amber window 60). With settled status (no expiry), it stays unscheduled/N/A.
11. Probation Review (one-off): completing it clears the due date (no reschedule).
12. Idempotency: re-submitting does not create duplicate evidence or double-advance.

## RAG + rollups
13. Register matrix: sticky Carer column, one column per check, RAG-coloured cells
    (green/amber/red), last completed beneath, sort by status, search.
14. A check with due date in the past shows red; within 30 days amber; else green.
15. Rollups: record worst-status pill, register summary strip counts, and the
    Dashboard compliant/due-soon/overdue counts all agree.

## Leavers / archived (exclusion everywhere)
16. Mark a person a leaver: they drop out of the register, the summary counts and
    the dashboard; their record shows a Leaver banner and keeps evidence history.
17. Archive a person: same exclusion; Restore brings them back.

## Permissions (RLS, not just UI) — needs a Manager, Supervisor, Team Member
18. Manager sees the full register for their branch(es) only.
19. Supervisor sees only assigned caseload (assign via Manage record > caseload);
    not the whole register.
20. Team Member visiting /people is redirected to their own linked record and can
    see no other records and no service user data.
21. Evidence read tightening: a branch member who is not a manager cannot read
    evidence outside their caseload/own record (was broad in Phase 2).

## Cross-tenant (needs a second company)
22. A user of company A cannot read company B's people, checks, or evidence.
