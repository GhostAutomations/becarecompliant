# Test checklist: ticket numbers per company, and one email per save, 2026-10-13

Phil's decisions: `docs/decisions/tickets.md` (status only change: one short email; no Closed
status; a customer's reply reopens a Resolved ticket). Migration 0453. Tests on Bevan; Thistle only
renumbered on Phil's go.

| # | Check | Result |
|---|-------|--------|
| T1 | Unit test: one email for reply and status together, one for either alone, none for nothing; no dashes | PASS (lib/tickets/options.test.ts) |
| T2 | Numbers: first Bevan ticket is 1; a refused save and a rolled back test use no number; the next is 2 | PASS in the rolled back dry run of 0453 (A got 1, refused, rolled back, C got 2; counter 2) |
| T3 | The founder's reply and status saved together in one call; nothing to save refused; a company user refused | PASS in the dry run |
| T4 | A customer's reply on a Resolved ticket reopens it to In progress | PASS in the dry run |
| T5 | Live on Bevan after 0453: raise tickets in the app, a refused save, and a rolled back test: no number skipped | Not tested |
| T6 | Live on Bevan as the Founder: reply and Resolved in one press: exactly one email produced (rendered, and its ticket.emailed record), one message, status Resolved | Not tested |
| T7 | Status only change: one short email; reply only: one email | Not tested |
| T8 | Raising a ticket, the RAG rating, screenshots, the founder text, both sides' replies, the Founder console list and filters, all as before | Not tested |
| T9 | Thistle renumber (on Phil's go): tickets, replies and screenshots counted before and after, matched by ticket; 3,4,5,6,7,14 become 1 to 6; next is 7; each audit history says what it was | Not tested |
