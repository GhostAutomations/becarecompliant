# Test checklist: the due date stays on a booked Whiteboard row (2026-10-05)

Thistle via Phil (popups, current phase, all companies): once a check is booked onto the Whiteboard it kept its booked date but lost its due date. Each booked row now reads, in fixed width columns: who | booked date and time | Due date | cancel. Red pill: the due date has passed. Amber pill: booked for after the due date. Plain otherwise. A visit with several tasks shows the earliest due date of the tasks not yet done; a visit with no check (ad hoc) shows no due date.

| # | Check (as Bev, Bevan, Planner, Whiteboard) | Result |
|---|-------|--------|
| W1 | The existing Supervision booking (booked 5 Oct, due 27 Sep) shows "Due 27 Sep" in a red pill | PASS (live 15:56, first deploy) |
| W2 | Book a check from To book for a date before its due date: the row shows "Due <date>" plain | NOT TESTED |
| W3 | Book a check for a date after its due date: amber pill | NOT TESTED |
| W4 | Rows under one heading line up: names left, then who, booked date and due date in straight columns | NOT TESTED |
| W5 | Cancelling a booking still works and the check goes back to To book with its date | NOT TESTED |
| W6 | Phone width: the row stays on one line, the name truncates first | NOT TESTED |
| W7 | Found on the first deploy (laptop 1281px, and Phil's iPad at Thistle): rows wider than their heading column, names gone, due dates spilling out. Fix: two heading columns per side only at 1900px and wider (Phil's desktop unchanged); narrower, one column per side; below 1024px People sits above Service Users. Check at 1281px, iPad landscape and portrait, and a wide desktop | NOT TESTED |
