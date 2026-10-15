# Test checklist: the Whiteboard matches My Planner, 2026-10-15

Phil's job (Thistle report). Decision: `docs/decisions/planner.md` (The Whiteboard matches My
Planner). No migration.

| # | Check | Result |
|---|-------|--------|
| W0 | Unit tests: the same bookings give the Planner list and the Whiteboard list, every planned one on the Whiteboard (multi task, custom title, ad hoc, tracker form, other checks, past dated, meeting); headings by key; the to book span: overdue from earlier weeks, a Monday rollover, month and year end, a resumed service user, done is never outstanding | PASS (lib/planner/whiteboard.test.ts, 12) |
| W1 | Supervision and appraisal due dates: Whiteboard (check instance) against the register (worked out slots) for every Thistle person | PASS (37 staff with an open supervision, LTL or appraisal; no differences) |
| W2 | Bevan: a two task visit, a One to One, an ad hoc job and a custom titled booking, read as the Bevan Supervisor and the Bevan Admin through their own permissions, then drawn by the Whiteboard rules: all four present (two lines for the visit, One to One and ad hoc under Other, titled under Supervision); My whiteboard shows the Supervisor's own; a Swansea only Supervisor sees none of these Neath bookings. Overdue from earlier weeks left in place. Put back: Bevan 1 planned booking as before | PASS (no active Manager login at Bevan; Manager checked on Thistle in W3) |
| W3 | After deploy, Thistle read only: every planned booking on the Planner is on the Whiteboard; list anything on one and not the other | PASS (37 planned bookings, 38 open tasks and 4 booked hearings: all 42 lines drawn, nothing on one and not the other; Newport filter 31 = 27 tasks + 4 hearings; the four weeks still 30 as before; My whiteboard and My Planner load) |
| W4 | Phil: Thistle Whiteboard All, the 24 Oct Medication Competency and Manual Handling visit visible | PASS (tested by Claude in Phil's Chrome at his request: under both headings, 24 Oct 09:15) |
| W5 | Phil: Thistle Whiteboard, the 16 Oct One to One visible under Other | PASS (tested by Claude at Phil's request: "One to One" under People, Other, with the 4 booked hearings, each opening the Absence page) |
| W6 | Phil: Thistle Whiteboard, the overdue Spot Checks, Lead the Leader and Setup Visits from before this week in the Overdue block | PASS (tested by Claude at Phil's request: Overdue 6, red dates, oldest first) |
