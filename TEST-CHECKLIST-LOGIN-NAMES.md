# Test checklist: changing a login's name (2026-10-12)

Phil's Job 1: a login's name can be corrected or changed (spelling mistake, marriage) on Settings,
Users. Decisions: `docs/decisions/login-names.md`. Migration 0445 (`rename_login`, and the name
is locked in the database so nothing else can change it). Bevan only.

Dry run of 0445 on the live database, rolled back (12 Oct, before applying): the Admin renamed a
Supervisor, a Senior with the People box ticked (record followed), an invited login with the box
unticked (invite followed, record did not), and themselves; the same name twice changed nothing;
the Founder login, a Thistle login and a blank name were refused; a direct update by the Admin and
by the Supervisor, and the Supervisor calling the function, were all refused; the "Conducted by"
dropdown held the new name and not the old; Evidence kept the old name; audit rows read "Changed
the name X to Y". Afterwards nothing remained. Applied live 12 Oct; security advisor 0 errors, signed out visitors cannot run it.

| # | Check | Result |
|---|-------|--------|
| N1 | Settings, Users, ZZ Test Supervisor: change the name, Save name: "Saving…" then green "Saved"; the list and popup show the new name | PASS (12 Oct, Claude in Phil's Chrome as Bev Admin: ZZ Test Supervisor to ZZ Test Supervisor Renamed, Saving then green Saved, popup heading and list updated) |
| N2 | Database: the login holds the new name; audit `user.renamed` with old and new name | PASS (login holds the new name; audit user.renamed "ZZ Test Supervisor -> ZZ Test Supervisor Renamed" by company_admin) |
| N3 | A form's "Conducted by" dropdown lists the new name, not the old | PASS (database: the Return to Work form's Conducted by options hold the new name, none hold the old) |
| N4 | ZZ TEST Senior (linked People record), box ticked: the People record's name changes too; box unticked: it does not | PASS (ZZ TEST Senior: ticked, login and People record both became ZZ TEST Senior Married; unticked, only the login went back and the hint read "It reads ZZ TEST Senior Married now."; ticked again with the same name, the People record followed; audit rows for each; names restored) |
| N5 | ZZ Audit Walk Person (invite not accepted): the pending invite takes the new name | PASS (ZZ Audit Walk Person, box unticked: login and pending invite became ZZ Audit Walk Renamed, People record unchanged; renamed back) |
| N6 | A blank name is refused beside the button, and what was typed stays | PASS (blank name: "Enter a name." beside the button, the box kept what was typed, nothing saved) |
| N7 | Evidence filed before the rename still shows the old name | PASS (4 Evidence entries still carry ZZ Test Supervisor, none carry the new name) |
| N8 | Signed in as the renamed login: the circle top right and its panel show the new name | PASS (Phil, 12 Oct: signed in as ZZ Test Supervisor, circle ZR, panel read ZZ Test Supervisor Renamed) |
| N9 | Phone width: the name box, tick box and Save name fit in the popup | PASS (Chrome at its narrowest, 500 wide: name box, tick box and Save name fit, no sideways scroll) |
| N10 | After applying: a Supervisor cannot rename anyone, themselves included, even directly in the database | PASS (12 Oct, live function, rolled back: ZZ Test Supervisor refused renaming themselves and the Admin through the function, and a direct update was refused) |
| N12 | Planner: the person picker lists the new name and the old name appears nowhere on the page | PASS (as Bev Admin, /planner) |
| N11 | Every test name put back as it was | PASS (ZZ Test Supervisor renamed back through rename_login as Bev Admin, audited; no test name left on any login, People record, invite or form) |

Known and left alone: a form someone already has open in their browser before a rename still holds
the old name in "Conducted by"; saving it is refused until they pick the name again. An outcome
letter for a meeting booked before the "conducted by" link existed finds the conductor by name, so
after a rename its sign off loses the role line under the name.
