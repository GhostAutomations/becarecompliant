# Test checklist: cloud drive copies (0437)

Run on a test SharePoint site first (Bevan), then Thistle. Each check: Pass / Fail / Not tested.
Anything Not tested goes into the Final Testing phase.

## Connecting
1. Settings shows a "Cloud drive" tile; only a Company Admin can open it (a Manager is turned away).
2. Without MS_CLIENT_ID / MS_CLIENT_SECRET / CLOUD_TOKEN_KEY set, Connect shows the "not set up yet" message rather than failing.
3. Connect goes to Microsoft, you sign in with a work account, and come back to Settings, Cloud drive, showing the account email.
4. Cancelling on the Microsoft screen comes back with a clear "cancelled" message, nothing connected.
5. A tenant that needs admin approval comes back with the "your Microsoft admin needs to approve" message.
6. SharePoint: searching a site name lists it; choosing it makes a "Be Care Compliant" folder with People, Service users, Complaints, Incidents, Policies and Briefings inside.
7. My OneDrive: the same folders appear in the signed-in user's OneDrive.
8. The database never holds the Microsoft token in plain text (cloud_connections.refresh_token_enc starts "v1:").

## Copies from now on
9. Add a person: a "Name (Branch)" folder appears under People within a few seconds.
10. Add a service user: the same under Service users.
11. Complete a form: its PDF lands in their folder named initials, (SSID for a service user), form name, date, e.g. "GA 12345 Spot Check 2026-10-09.pdf"; a second the same day gets " (2)". Same pattern for certificates, letters, care plans and uploads.
12. A form with an uploaded file: the file lands beside the PDF.
13. Paper upload of a form: the PDF and its files are copied.
14. Training certificate upload: copied into the person's folder.
15. Absence meeting invite and outcome letters: copied into the person's folder.
16. Care plan upload (both routes): copied into the service user's folder.
17. Complaint and incident forms: copied into Complaints and Incidents.
18. New policy, new written version and new uploaded version: each version copied into Policies.
19. Memo briefing: the memo PDF and its attachments copied into Briefings.
20. Import of people and service users: folders made for each.
21. Rename a person or move them to another branch: next copy renames the folder, nothing duplicated.
22. Archive a person (leaver): their folder stays as it was.

## Copy everything so far
23. The button is there once a location is chosen; pressing it says how many are queued.
24. The waiting count goes down over the next few runs (about 60 a minute) and the files arrive.
25. Pressing it a second time queues nothing new and makes no duplicate files.

## Problems and recovery
26. Delete a person's folder in SharePoint, then complete a form: the folder is made again and the copy lands.
27. Revoke the app's access in Microsoft (My Apps): status turns to "reconnect", Admins get one email a day with a button, copies wait rather than fail.
28. Reconnecting picks the waiting copies back up.
29. A copy that keeps failing shows in Failed with its message; "Try again now" retries it.
30. Disconnect: tokens are removed, nothing more is copied, files already in the drive stay.
31. Choosing a different place after copying: "Copy everything so far" fills the new place in full.
32. The cron (/api/cron/cloud-copies) refuses calls without the CRON_SECRET.
33. Bevan (test company) has its emails muted, so check the reconnect email on Thistle or in Resend logs.

## Results, 9 Oct 2026 (Bevan, copying to Phil's Thistle OneDrive)
- PASS 1, 3, 7, 8, 9, 11: tile, connect, OneDrive folders, tokens sealed, person folder on add, form PDF copied (checked by eye).
- PASS 23, 24, 25: Copy everything so far, 623 copies, 0 failed; pressed twice, nothing new queued.
- PASS load test: 137 forms completed through the real Complete page (12 form types) and 100 uploads
  (60 training certificates, 16 care plans, 24 paper copies) plus 30 attachment files. Every one copied,
  0 failed, slowest copy 3 seconds after saving.
- PASS open test, drive connected: 100 documents opened through BCC (70 evidence PDFs rendered on
  demand, 15 uploaded files, 15 certificates), 100 of 100 OK, all served from BCC's own storage,
  median 1.1 s for a PDF, 0.6 to 0.8 s for a file. Nothing is read from OneDrive.
- Not tested yet: 2, 4, 5, 6 (SharePoint site), 10, 12 to 22, 26 to 33.
- Found and fixed: a record lookup ("start typing a name") accepted a name matching nobody.
- PASS open test, drive disconnected (9 Oct, 08:45): the same 100 documents, 100 of 100 OK, all from BCC's
  own storage, median 1.4 s for a PDF, 0.8 s for a file. No difference from connected beyond normal variation.
- PASS 30: Disconnect removed the tokens and the queue; a Spot Check completed while disconnected queued nothing.
- PASS lookup fix, live: typing a name that matches nobody is refused on screen and nothing is saved;
  picking a real name saves as normal.
