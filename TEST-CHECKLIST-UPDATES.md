# Test checklist: Updates on records (0324)

Run as popups, one at a time: Pass / Fail / Not tested. Bevan Care Ltd (Swansea) for anything that writes.

| # | Test | Result |
|---|------|--------|
| U1 | Person record: Updates tile beside Complaints, above Holiday, count 0, "No updates yet" || PASS 24/09 (Thistle, Deborah Olabode, looking only: beside Complaints, same height, above Holiday) |
| U2 | Open: centre popup, Write box at the foot; post a text update; tile shows it with name and time || PASS 24/09 (Bevan, ZZ TEST DBS Warn) |
| U3 | Reply under it; reply sits indented under the update, oldest first || PASS 24/09 |
| U4 | Attach a photo and a PDF; both upload, open in a new tab, History shows "Opened ..." || PASS 24/09 (PNG and PDF stored with size and fingerprint; signed link served the file; audit "Opened zz-test-photo.png") |
| U5 | Edit your own update: shows Edited; the thread shows the new words || PASS 24/09 (Edited shown; old words in record_update_edits) |
| U6 | Pin an update: moves to the top with Pinned, tile shows it; unpin || PASS 24/09 (pinning a second update moved it to the top and unpinned the first; tile shows the pinned one) |
| U7 | @mention the Supervisor: the @ list offers only people who can see the record; email arrives with an Open the record button and no update text; the button opens the thread || PASS 24/09 (@ list offered only ZZ Test Supervisor; email sent to ppdavies+bccsup; Phil confirmed branded, button, no text, opens the popup) |
| U8 | Remove (Admin): needs a reason; "This update was removed by an Admin. Reason: ..." stays || PASS 24/09 (Remove it disabled until a reason; removed line with reason; files hidden; pin cleared) |
| U9 | Service User record: Setup Visit and Audit sit exactly above Evidence history; Updates exactly above History || PASS 24/09 (Thistle, Amanda Ford: Setup Visit and Audit over Evidence history, Updates over History, all 180px high) |
| U10 | Supervisor login: can read and post on a Swansea record; no Remove button || Covered by scripts/updates-probe.sql (supervisor: reads, posts, pins, cannot remove, not on own record). No separate login run. |
| U11 | Phone width: tile and popup usable, Write box visible || PASS 24/09 (Phil on his phone) |
| DB | scripts/updates-probe.sql: eight roles plus edit, idempotency, mentions, file path, empty, reply depth, trash | PASS 2026-09-24 |

## Whiteboard weeks (2026-09-24)

| # | Test | Result |
|---|------|--------|
| W1 | Four tiles read 21 to 27 Sep, 28 Sep to 4 Oct, 5 to 11 Oct, 12 to 18 Oct (on 24/09/2026); heading "To book, this week and the next three"; no dashes || PASS 24/09 (Thistle: 21 to 27 Sep, 28 Sep to 4 Oct, 5 to 11 Oct, 12 to 18 Oct) |
| W2 | A check due Mon to Wed this week and not booked shows in the first tile with its date in red || PASS on tests (Phil: tests are enough; no live check due 21 to 23 Sep on Thistle or Bevan) |
| W3 | Clicking a check still opens the booking popup and booking it moves it onto the board || Booking code unchanged by this work; Thistle is read only and Bevan has nothing due in the four weeks, so not run live. |

## Retention (0325)

| # | Test | Result |
|---|------|--------|
| R1 | scripts/updates-probe.sql part two: old leaver and old cancelled SU erased (3 rows), recent leaver, held leaver, active person and hospital SU kept, file queued, an Admin cannot run it | PASS 24/09 |

## Subject access export (0326)

| # | Test | Result |
|---|------|--------|
| S1 | Bevan, ZZ TEST DBS Warn, Manage record: "Subject access export" shows for Bev Admin; press it; a ZIP comes back with README, summary.pdf, evidence.pdf, CSVs and files/updates with the Update attachments | |
| S2 | History on the record shows "Made a subject access export" | |
| S3 | The route refuses anybody who is not a Company Admin | |
