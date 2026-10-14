# Test checklist: Tickets layout and who sees which tickets, 2026-10-14

Decision: `docs/decisions/tickets.md`. Migration 0470 (applied 2026-10-14). Run one at a time.

Bevan test tickets 8 to 17 ("ZZ Ticket test: ...", all People problems): red, amber and green;
open, in progress and resolved; raised 2 to 30 days ago; raised by the Admin, Registered Manager,
Manager and Supervisor test logins. Two test messages (on tickets 8 and 13).

| # | Check | Result |
|---|-------|--------|
| T0 | Claude's own checks: 4 new unit tests (sections, both sort orders, empty); full suite 2,000 pass, typecheck and build pass; 0470 proved in a rolled back transaction querying as each user: Admin and Registered Manager 10 tickets and 2 messages before and after; Manager 10 before, only their own 2 tickets and 1 message after, and refused replying to the Admin's ticket; Supervisor their own 3 before and after; after applying, only can_see_support_ticket changed (no other function, policy, trigger or view), security advisor no ERROR | PASS (Claude) |
| T1 | Bevan, Tickets as Admin: "Open and in progress · 6" open with Red (8, then 11 below it), Amber (9 with an In progress pill, then 12), Green (10, then 13); "Resolved · 4" folded, and when opened Red shows 17 above 14, Amber 15, Green 16 | PASS (Claude, Claude browser as Bev: exactly as stated; on a phone the columns stack red, amber, green with no sideways scroll) |
| T2 | Bevan, the live refresh: change a test ticket's status from the Founder console and the Admin's Tickets page moves it without reloading | PASS (Claude: ticket 12 set to In progress through the Founder's status function; the open page showed its In progress pill within 5 seconds, no reload) |
| T3 | Founder console, Tickets: the same layout across all companies, with the company name on each card; Open and in progress open, Resolved folded with its count | PASS (Claude, in Phil's Chrome as the Founder at his request: Open and in progress · 11, Red 2, Amber 5, Green 4, oldest first, company on each card; Resolved · 11 folded, then Red 4, Amber 4, Green 3, newest resolved first, matching the database) |
| T4 | Thistle as Company Admin, Tickets: the same layout with all of Thistle's tickets (4 open, 1 in progress, 7 resolved) | PASS (Claude, the Founder managing Thistle at Phil's request: Open and in progress · 5, Red None, Amber 3 with Ticket 4 In progress first, Green 2; Resolved · 7 folded, then Red 2, Amber 3, Green 2; "Every ticket from your company is shown") |
| T5 | Thistle as a Supervisor (or Bevan's ZZ Test Supervisor): only their own tickets | PASS (Phil's popup: the database proof is enough. As the Supervisor at the database: their own 3 tickets, none of the others' and no messages; as the Manager: their own 2 and refused replying to another's) |
