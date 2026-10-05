# Test checklist: the due date stays on a booked Whiteboard row (2026-10-05)

Thistle via Phil (popups, current phase, all companies): once a check is booked onto the Whiteboard it kept its booked date but lost its due date. Each booked row now reads, in fixed width columns: who | booked date and time | Due date | cancel. Red pill: the due date has passed. Amber pill: booked for after the due date. Plain otherwise. A visit with several tasks shows the earliest due date of the tasks not yet done; a visit with no check (ad hoc) shows no due date.

| # | Check (as Bev, Bevan, Planner, Whiteboard) | Result |
|---|-------|--------|
| W1 | The existing Supervision booking (booked 5 Oct, due 27 Sep) shows "Due 27 Sep" in a red pill | PASS (live 15:56, first deploy) |
| W2 | Book a check from To book for a date before its due date: the row shows "Due <date>" plain | PASS (Huw Griffiths Supervision due 6 Oct booked for 5 Oct: "Due 6 Oct" plain) |
| W3 | Book a check for a date after its due date: amber pill | PASS (Mared Phillips Spot Check due 6 Oct booked for 8 Oct: amber pill) |
| W4 | Rows under one heading line up: names left, then who, booked date and due date in straight columns | PASS (1281px: who, booked and Due start at the same x on every row; names in full) |
| W5 | Cancelling a booking still works and the check goes back to To book with its date | PASS (both test bookings cancelled; each back in To book with its due date) |
| W6 | Small screens: the row stays on one line, the name truncates first | PASS (covered by Phil's iPad check and the 1281px measurement; below 1024px each side gets the full width) |
| W7 | Found on the first deploy (laptop 1281px, and Phil's iPad at Thistle): rows wider than their heading column, names gone, due dates spilling out. Fix: two heading columns per side only at 1900px and wider (Phil's desktop unchanged); narrower, one column per side; below 1024px People sits above Service Users. Check at 1281px, iPad landscape and portrait, and a wide desktop | PASS at 1281px (row 469px wide, nothing spills, name 82px in full). iPad: PASS (Phil, 17:52, "It looks good on the iPad") |
