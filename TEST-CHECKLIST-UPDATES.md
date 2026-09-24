# Test checklist: Updates on records (0324)

Run as popups, one at a time: Pass / Fail / Not tested. Bevan Care Ltd (Swansea) for anything that writes.

| # | Test | Result |
|---|------|--------|
| U1 | Person record: Updates tile beside Complaints, above Holiday, count 0, "No updates yet" | |
| U2 | Open: centre popup, Write box at the foot; post a text update; tile shows it with name and time | |
| U3 | Reply under it; reply sits indented under the update, oldest first | |
| U4 | Attach a photo and a PDF; both upload, open in a new tab, History shows "Opened ..." | |
| U5 | Edit your own update: shows Edited; the thread shows the new words | |
| U6 | Pin an update: moves to the top with Pinned, tile shows it; unpin | |
| U7 | @mention the Supervisor: the @ list offers only people who can see the record; email arrives with an Open the record button and no update text; the button opens the thread | |
| U8 | Remove (Admin): needs a reason; "This update was removed by an Admin. Reason: ..." stays | |
| U9 | Service User record: Setup Visit and Audit sit exactly above Evidence history; Updates exactly above History | |
| U10 | Supervisor login: can read and post on a Swansea record; no Remove button | |
| U11 | Phone width: tile and popup usable, Write box visible | |
| DB | scripts/updates-probe.sql: eight roles plus edit, idempotency, mentions, file path, empty, reply depth, trash | PASS 2026-09-24 |

## Whiteboard weeks (2026-09-24)

| # | Test | Result |
|---|------|--------|
| W1 | Four tiles read 21 to 27 Sep, 28 Sep to 4 Oct, 5 to 11 Oct, 12 to 18 Oct (on 24/09/2026); heading "To book, this week and the next three"; no dashes | |
| W2 | A check due Mon to Wed this week and not booked shows in the first tile with its date in red | |
| W3 | Clicking a check still opens the booking popup and booking it moves it onto the board | |
