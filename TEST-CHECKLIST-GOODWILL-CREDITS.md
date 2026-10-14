# Test checklist: Goodwill credits, 2026-10-14

Decision: `docs/decisions/goodwill-credits.md`. Migration 0472. Test writes on Bevan Care Ltd only;
no credits to Thistle, Demo or any real company. Run one at a time.

| # | Check | Result |
|---|-------|--------|
| G0 | Claude's own checks: 16 new unit tests (weekly, monthly on the 31st, month ends, 29 Feb 2028, end by count, end by date, the next date, the form's refusals, the summary sentence, the Credits added labels and London dates); full suite, typecheck and build pass | PASS (Claude) |
| G1 | 0472 proved in a rolled back transaction on Bevan: one off SMS only, AI only and both, given at once; a future one off waits; weekly 3 times and monthly from 31 Jul give 3 each (31 Jul, 31 Aug, 30 Sep) then finish; monthly from 31 Aug until 31 Dec gives 31 Aug and 30 Sep and stays running; the job run twice more gives nothing; Stop keeps the 2 given and the job gives nothing more; a second Stop is refused; balances moved by exactly the credits given; spending SMS and AI still works; no other company touched; the private note is not in the audit log | PASS (Claude) |
| G2 | Company Admin (Bev) refused at the database: create, stop, running the job and writing the table directly are all refused; Bev sees no grants and no periods, and does see the goodwill ledger lines | PASS (Claude) |
| G3 | After 0472 is applied, live on Bevan: the test grants, the job run several times, a Stop, before and after balances and ledger counts | Not tested |
| G4 | Cron: /api/cron/goodwill-credits refuses a call without the secret (401) and is scheduled in Vercel | Not tested |
| G5 | Phil: Founder console, the Goodwill credits tile, and its page empty: "No goodwill credits given yet." | Not tested |
| G6 | Phil: a one off grant to Bevan shows in the page's History | Not tested |
| G7 | Phil: Bevan's Billing page (Manage as company) shows "Credits added" with the goodwill line, and no reason or note | Not tested |
