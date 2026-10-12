# Test checklist: the whole letter on the editor page, job titles, outcome letter fix (2026-10-12)

Phil's decisions: `docs/decisions/letter-editor-whole-page.md` and the last section of
`docs/decisions/letter-editor.md`. Migration 0447 (job titles) applied and through the security
advisor (no ERROR; the one new WARN is the intended "a signed in user can call it", as rename_login).

Database proof, inside a rolled back transaction on Bevan: Bev Admin set a job title on her own
login and on ZZ Test Supervisor; the same title twice changed and logged nothing; the Supervisor
could not change their own, directly or through the function; the audit row reads "Set the job
title of ZZ Test Supervisor to Senior Supervisor".

| # | Check | Result |
|---|-------|--------|
| W1 | The outcome letter's drafted words survive (the Thistle letter that kept only its opening) | PASS (12 Oct: cause found in the Part B merge and fixed, with a test; Phil regenerated Janet's letter as Thistle admin and it came back whole: absences, discount, each absence, outcome, next step. Hayley sent it 15:16) |
| W2 | A letter with no outcome: warning, cannot be sent, Regenerate is free | PASS (Bevan, ZZ Stage One C Stage 3, a letter saved holding only its opening: the amber warning showed, Approve and send was disabled, Regenerate brought the whole letter back, the warning went, and Bevan's AI balance stayed 112: one spend, one refund. Thistle's earlier draft was refunded by hand at Phil's go) |
| W3 | Outcome letter box: editor and PDF side by side, the send box centred beside the signature box | PASS (Chrome, Janet's letter as Thistle admin, looked at only; and Bevan as Bev Admin) |
| W4 | Book meeting: the editor shows the whole letter as the PDF does (letterhead, date, Private and confidential, address, Dear, RE line, sign off, signature, name, job title) | PASS (Chrome as Bev Admin, ZZ Stage One, Stage 4, not saved: side by side the two read the same) |
| W5 | The meeting details show as the PDF's table and cannot be typed over or removed | PASS (bold labels, no colons; deleting the details and select all then delete both left them in place; they cannot be typed into) |
| W6 | Settings, Users: an Admin sets a login's job title; it prints under the name and after "Held by" | PASS (Bev Admin set to Registered Manager: Saved, the audit row "Set the job title of Bev Admin to Registered Manager", and Book meeting showed "Bev Admin / Registered Manager" and "Held by: Bev Admin, Registered Manager" in the editor and the PDF) |
| W7 | Settings, Letters: the invitation template's editor shows the whole letter, with the example details and absences where the letter adds them | PASS (the frame, the details table and both example absences shown in place; the example "could lead to" sentence still had the old wording and was corrected) |
| W8 | The top right menu shows the job title | PASS (Chrome as Bev Admin: the menu reads Bev Admin, Registered Manager, Bevan Care Ltd) |
| W9 | Phone width: the two boxes stack, nothing runs off the side | Not tested |
| W10 | Book meeting: an edited letter keeps its words when the date changes, and the locked details follow; Teams and No signature match the PDF; Back to the standard letter works | PASS (12 Oct, Chrome as Bev Admin, ZZ Stage One, not saved) |
| W11 | Fresh AI outcome letters: a warning letter has the appeal paragraph; discounted absences are marked and explained; dates in full | PASS (ZZ Stage One C Stage 2 and ZZ TEST DBS Warn Stage 1, drafted, not sent) |
| W12 | The AI never talks to the employee about "the record", "not recorded" or "questions asked" | PASS (after the change, ZZ TEST Audit Starter Stage 1: none of those words) |
| W13 | Small counts in AI drafts in words ("three absences within a six month period") | Not tested (built and unit tested; goes live with the next push) |

