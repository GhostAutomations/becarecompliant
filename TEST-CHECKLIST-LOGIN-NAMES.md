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
| N1 | Settings, Users, ZZ Test Supervisor: change the name, Save name: "Saving…" then green "Saved"; the list and popup show the new name | Not tested |
| N2 | Database: the login holds the new name; audit `user.renamed` with old and new name | Not tested |
| N3 | A form's "Conducted by" dropdown lists the new name, not the old | Not tested |
| N4 | ZZ TEST Senior (linked People record), box ticked: the People record's name changes too; box unticked: it does not | Not tested |
| N5 | ZZ Audit Walk Person (invite not accepted): the pending invite takes the new name | Not tested |
| N6 | A blank name is refused beside the button, and what was typed stays | Not tested |
| N7 | Evidence filed before the rename still shows the old name | Not tested |
| N8 | Signed in as the renamed login: the circle top right and its panel show the new name | Not tested |
| N9 | Phone width: the name box, tick box and Save name fit in the popup | Not tested |
| N10 | After applying: a Supervisor cannot rename anyone, themselves included, even directly in the database | PASS (12 Oct, live function, rolled back: ZZ Test Supervisor refused renaming themselves and the Admin through the function, and a direct update was refused) |
| N11 | Every test name put back as it was | Not tested |

Known and left alone: a form someone already has open in their browser before a rename still holds
the old name in "Conducted by"; saving it is refused until they pick the name again. An outcome
letter for a meeting booked before the "conducted by" link existed finds the conductor by name, so
after a rename its sign off loses the role line under the name.
