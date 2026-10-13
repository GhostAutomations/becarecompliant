# Test checklist: Tickets update live, 2026-10-13

Phil's decisions: `docs/decisions/tickets.md` (Live updates). Migration 0454. F146 fixed for the
ticket tables, F142 on the ticket channel only, F155 parked (THE LIST 57). Tests on Bevan.

| # | Check | Result |
|---|-------|--------|
| L1 | Who can join which ticket channel, two companies (rolled back): Bevan Admin, Supervisor, Recruiter, On Call: Bevan only; Bevan Senior, Viewer, carer: none; Demo Admin: Demo only; Founder: every company and "founder"; nobody else "founder" | PASS in the dry run of 0454 and again live after applying it (same table, two companies: Bevan and Demo) |
| L2 | Raising and replying send nudges only to the company's ticket channel and "founder", with no ticket content | PASS in the dry run (payload: table name only) |
| L3 | F146: a direct reply insert and a counter delete as a signed in user are refused; raising and replying through the functions still work, numbering continues | PASS in the dry run |
| L4 | Live: Founder Tickets list open; a Bevan user raises a ticket: it appears at the top within a few seconds, counts update, the toast says "New ticket from Bevan Care Ltd" | PASS (live dpl_HbFPX, Chrome as the Founder on the Founder Tickets list; a Bevan ticket raised as Bev Admin through raise_support_ticket: it appeared at the top 1.4 s later with no reload (a marker on the page survived), Open and in progress went 3 to 4, the toast said "New ticket from Bevan Care Ltd". It was Bevan Ticket 4, continuing the count) |
| L5 | Live: a reply from either side appears in the open conversation, newest at the bottom, scrolled to it, for the Founder and the company | PASS (Founder side: two Bev Admin replies appeared 1.2 s after, oldest at the top, newest at the bottom and in view. Company side: Chrome as Bev Admin on the open ticket; the Founder's reply and In progress appeared 1.3 s after, status pill changed, newest in view, no reload) |
| L6 | Connection off: the poll fallback still brings the change in | PASS (the page's live socket closed and every rejoin dropped: 0 live messages arrived, yet two tickets raised while cut appeared through the 10 second fallback, 3.6 s and 0.6 s after, no reload) |
| L7 | Phone width: the list and a conversation | PASS (Phil on his phone as the Founder: the Tickets list and a ticket conversation read well) |
| L8 | Raising, replies, screenshots, the text alert, emails and numbering as before | PASS (after 0454, as Bev Admin through the app: a ticket with a screenshot raised as Bevan Ticket 7, the screenshot shows, the founder was texted, audit "Ticket 7 raised"; replies through the functions work both ways. Emails: the one email code is unchanged since its own tests) |
| L9 | Another live screen still updates (the Dashboard or the People register) | PASS (Founder in support mode for Bevan on the People register: a people row nudged in the database, the register refreshed itself 0.9 s later with no reload; support mode left afterwards) |
