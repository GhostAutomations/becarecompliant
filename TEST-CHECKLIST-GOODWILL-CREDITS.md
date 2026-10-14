# Test checklist: Goodwill credits, 2026-10-14

Decision: `docs/decisions/goodwill-credits.md`. Migration 0472 (applied 2026-10-14). Test writes on Bevan Care Ltd only;
no credits to Thistle, Demo or any real company. Run one at a time.

| # | Check | Result |
|---|-------|--------|
| G0 | Claude's own checks: 16 new unit tests (weekly, monthly on the 31st, month ends, 29 Feb 2028, end by count, end by date, the next date, the form's refusals, the summary sentence, the Credits added labels and London dates); full suite, typecheck and build pass | PASS (Claude) |
| G1 | 0472 proved in a rolled back transaction on Bevan: one off SMS only, AI only and both, given at once; a future one off waits; weekly 3 times and monthly from 31 Jul give 3 each (31 Jul, 31 Aug, 30 Sep) then finish; monthly from 31 Aug until 31 Dec gives 31 Aug and 30 Sep and stays running; the job run twice more gives nothing; Stop keeps the 2 given and the job gives nothing more; a second Stop is refused; balances moved by exactly the credits given; spending SMS and AI still works; no other company touched; the private note is not in the audit log | PASS (Claude) |
| G2 | Company Admin (Bev) refused at the database: create, stop, running the job and writing the table directly are all refused; Bev sees no grants and no periods, and does see the goodwill ledger lines | PASS (Claude) |
| G3 | After 0472 is applied, live on Bevan: the test grants, the job run several times, a Stop, before and after balances and ledger counts | PASS (Claude: one off 10 SMS through the form in Phil's Chrome as the Founder; one off 5 AI and one off 3 SMS and 2 AI; weekly 3 times back dated gave 30 Sep, 7 Oct, 14 Oct and finished; monthly from 31 Aug until 31 Dec gave 31 Aug and 30 Sep, then Stop kept both; job runs 2, 3 and after the Stop gave 0; one SMS and one AI spend worked; Bevan SMS 3,997 to 4,015 (+19, -1), AI 75 to 89 (+15, -1); Thistle and Demo unchanged; no goodwill on any other company; the private note not in the audit log) |
| G4 | Cron: /api/cron/goodwill-credits refuses a call without the secret (401) and is scheduled in Vercel | PASS (Claude: 401 without the secret on www.becarecompliant.com; in vercel.json of the READY production deploy at 15 0 * * *) |
| G5 | Phil: Founder console, the Goodwill credits tile, and its page empty: "No goodwill credits given yet." | PASS (Phil) |
| G6 | Phil: a one off grant to Bevan shows in the page's History | PASS (Phil) |
| G7 | Phil: Bevan's Billing page (Manage as company) shows "Credits added" with the goodwill line, and no reason or note | PASS (Phil; also Claude as Bev Admin) |
