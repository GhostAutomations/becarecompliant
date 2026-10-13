# Test checklist: Tickets update live, 2026-10-13

Phil's decisions: `docs/decisions/tickets.md` (Live updates). Migration 0454. F146 fixed for the
ticket tables, F142 on the ticket channel only, F155 parked (THE LIST 57). Tests on Bevan.

| # | Check | Result |
|---|-------|--------|
| L1 | Who can join which ticket channel, two companies (rolled back): Bevan Admin, Supervisor, Recruiter, On Call: Bevan only; Bevan Senior, Viewer, carer: none; Demo Admin: Demo only; Founder: every company and "founder"; nobody else "founder" | PASS in the dry run of 0454 |
| L2 | Raising and replying send nudges only to the company's ticket channel and "founder", with no ticket content | PASS in the dry run (payload: table name only) |
| L3 | F146: a direct reply insert and a counter delete as a signed in user are refused; raising and replying through the functions still work, numbering continues | PASS in the dry run |
| L4 | Live: Founder Tickets list open; a Bevan user raises a ticket: it appears at the top within a few seconds, counts update, the toast says "New ticket from Bevan Care Ltd" | Not tested |
| L5 | Live: a reply from either side appears in the open conversation, newest at the bottom, scrolled to it, for the Founder and the company | Not tested |
| L6 | Connection off: the poll fallback still brings the change in | Not tested |
| L7 | Phone width: the list and a conversation | Not tested |
| L8 | Raising, replies, screenshots, the text alert, emails and numbering as before | Not tested |
| L9 | Another live screen still updates (the Dashboard or the People register) | Not tested |
