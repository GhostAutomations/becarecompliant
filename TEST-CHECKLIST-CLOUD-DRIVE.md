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

## Added by the review fixes (commit 6412779f)
34. Two records with the same name in one branch get separate folders: "John Smith (Cardiff)" and "John Smith 2 (Cardiff)".
35. A folder name already taken by another record's folder is never shared: a new folder is made instead.
36. Support mode (manage as company) cannot connect, choose or change a company's drive.
37. "Change where the folder lives" clears the place; choosing again reuses an existing Be Care Compliant folder.
38. Financial Transaction on the staff portal saves with the service user's name typed (no list is offered there).
39. A policy with a reference is copied as "<reference> <title> v<version>.pdf".

## Results, 9 Oct 2026 after the review fixes (Bevan)
- PASS Spot Check, live: a made up service user name is refused on screen; picking a real one saves.
  Copied as "RE Spot Check 2026-10-09 (4).pdf" into Rhodri Evans (Llanelli) 4 seconds after saving
  ("(4)": his fourth Spot Check that day).
- PASS paper upload on a service user: "BF BEV02006 Audit 2026-10-09.pdf" and
  "BF BEV02006 Audit icon-192 2026-10-09.png" in Berwyn Foulkes (Llanelli), both within 4 seconds.
- PASS training certificate: "RE Diversity and Equality certificate 2026-10-09.png" in Rhodri's folder.
- PASS 37: the location cleared (audit "cloud.location_cleared"); choosing My OneDrive again reused the
  same Be Care Compliant folder and Rhodri's folder (no "1" copies). A second certificate on the same
  course replaced the file rather than adding another.
- PASS progress endpoint answers with 0 waiting, 0 failed.
- PASS Incident Report, live: a made up service user name is refused; picking a real one files the
  report (test incident "Fall", Llanelli). Copied as "2026-10-09 Incident Report D71AD774 (v1).pdf"
  into Incidents 2 seconds later.
- 34: the "Name 2 (Branch)" naming passes its unit tests; 34, 35 and 39 are otherwise checked in code
  review only, not seen live yet.
- Not tested by me: 38 (needs a carer login on the staff portal), 36.
- Note: Bevan's older files keep their old names. The disconnect test emptied the queue, so pressing
  "Copy everything so far" in Bevan now would add a second copy of every older file under the new
  names. Don't press it in Bevan; Thistle starts clean.

## Category folders inside each record's folder (9 Oct 2026)
Phil: everything for a person landed loose in one folder. Decided by popup: one folder per check
(named like the check), plus Holiday, Absence, Training, Documents, DBS, Right to Work, Probation
and, on a service user, Care Plan; anything left over in a folder named after its form. The whole
set is made when the record's folder is made, and files already copied flat are moved in.
40. A new person or service user gets their folder with the full set of category folders inside.
41. A completed check's form lands in that check's folder (a Spot Check in "Spot Check"); a
    holiday request in Holiday; absence forms and letters in Absence; a training certificate in
    Training; an ad hoc document in Documents; a care plan in Care Plan.
42. A form no check uses and no category names (Financial Transaction) gets a folder of its own.
43. Files already copied flat (Rhodri Evans in Bevan) are moved into their folders, names unchanged.
44. A file deleted in the drive, or a name already taken in the folder, is left alone, not an error.
45. Complaints, incidents, policies and briefings are unchanged.

Run by Claude on 9 Oct 2026 after the deploy of 6056b319 was READY (no migration), on Bevan's
drive (OneDrive), the only company connected.
- 40 PASS. Rhodri Evans (Llanelli) now holds Holiday, Absence, Training, Documents, DBS, Right to
  Work, Probation and one folder per check he has (Supervision, Annual Appraisal, Spot Check,
  Medication Competency, Manual Handling, Audit, Mentoring, Lead the Leader, One to One, Health
  Check). ZZ TEST Service User Two (Swansea) holds Care Plan, Documents, Setup Visit, Care Plan
  Review, Audit and Platform Audit.
- 43 PASS. The 8 tracked files moved in: Holiday 3 (the holiday requests), Training 2 (the two
  certificates), Documents 2 on Rhodri and 1 on the service user. Names unchanged.
- 45 PASS. The incident report's move was skipped: "Not a record's file: left where it is."
- Found: older loose files in both folders (for example "RE Spot Check 2026-10-09 (4).pdf",
  "2026-10-09 Audit 4EF78B75 (v1).pdf") are copies from before Bevan's drive location was changed
  during testing. Changing the location forgets old copies by design, so BCC no longer knows those
  files and cannot move them. Test leftovers only; Thistle starts clean.
- 41 PASS for new copies: Rhodri's Spot Check, Supervision and Annual Appraisal forms were queued
  again and landed in "Spot Check" (e.g. "RE Spot Check 2026-09-10.pdf") and their own folders.
  Holiday, Training and Documents passed through the moves above.
- 42 and 44 not run live (no such file in Bevan); the rules are unit tested and the move skips are
  in the code.

## Comprehensive filing test (Phil, 9 Oct 2026)

Two people (Rhodri Evans, existing; ZZ TEST Filing Person, created through Add person) and two
service users (ZZ TEST Service User Two, existing; ZZ TEST Filing SU, created through Add service
user), two of every kind of file, on Bevan's OneDrive. Run by Claude through the real screens as
Bev Admin, except where marked. Every file was then read back from the drive, inside Be Care
Compliant only.

46. A new person and a new service user get their folder and the full category set when created.
47. Two of every check form on all four records land in that check's folder.
48. Holidays, training certificates, ad hoc documents, care plans, DBS, Right to Work, Probation,
    absences, Return to Work, absence meeting letters and outcome letters land in their folders.
49. A form no check uses gets a folder named after the form.
50. Nothing fails in the queue.

Results:
- 46 PASS. Both new records got their folder and every category folder at creation. The new
  service user's care plan, uploaded on the Add screen, landed in Care Plan.
- 47 PASS. 56 check forms (Supervision, Annual Appraisal, Spot Check, Medication Competency,
  Manual Handling, Audit, Mentoring, Lead the Leader, One to One, Health Check on both people;
  Setup Visit, Care Plan Review, Audit, Platform Audit on both service users), each submitted
  twice through the Complete page. Each folder on the new records holds exactly 2 files, the
  second named "(2)".
- 48 PASS. On the screens: 4 holidays (Holiday page), 4 certificates (Documents tile, course path,
  into Training), 8 ad hoc documents including two uploaded together, care plan replaced on both
  service users, DBS x4 and Right to Work x4 with uploaded evidence (form PDF and the uploaded file
  both in DBS / Right to Work), Probation x2 on the new person, 4 absences and 4 Return to Work
  interviews (Absence page). All in their folders. The new person's Absence folder holds 8: 2
  absence forms, 2 Return to Work, 2 meeting invitations, 2 outcome letters.
  Not through the screens: the 8 absence letters were made in the database from existing Bevan
  letters (neither test person had reached a meeting stage), then queued as the app queues them.
- 49 PASS (data made in the database). Financial Transaction evidence on all four records made a
  "Financial Transaction" folder in each, 2 files each.
- 50 PASS. 158 queue jobs from the test, all done, none failed.
- By design: a care plan replaced twice on the same day keeps one copy ("the latest plan is the
  plan"), so Care Plan holds 1 file, not 2.
- By design: Rhodri has passed probation, so he has no Probation form to complete.
- Found: Right to Work and Probation keep their draft after saving, so the next one opens filled
  in with the last answers (and "Signature captured" over an empty box). DBS and check forms
  clear correctly. Reported to Phil.

## Branch folders (0441, Phil, 9 Oct 2026)

People > [Branch] > [Person], Service Users > [Branch] > [Service user]; record folders are named
without the branch; a transfer moves the folder; existing folders are moved in.
51. After deploy, every existing record folder in Bevan moves into its branch folder, renamed
    without "(Branch)", with everything inside it.
52. A new person or service user gets their folder inside their branch's folder.
53. Transferring a record to another branch moves its folder, contents and all, within a minute.
54. Renaming a record renames its folder; renaming a branch renames the branch folder.
55. Complaints, Incidents, Policies and Briefings are unchanged.

Run by Claude on 9 Oct 2026 after deploy e37decb4 was READY and 0441 applied, on Bevan's OneDrive,
read back inside Be Care Compliant only.
- 51 PASS. Rhodri Evans and ZZ TEST Filing Person moved into People > Llanelli; ZZ TEST Service
  User Two and ZZ TEST Filing SU into Service Users > Swansea. Renamed without "(Branch)", every
  category folder and file inside them intact (the new person kept all 18).
- 52 PASS. ZZ TEST Branch Folder Person, added through Add person in Swansea, got People > Swansea >
  ZZ TEST Branch Folder Person with all 16 category folders.
- 53 PASS. Transferred ZZ TEST Filing Person from Llanelli to Neath through Manage record: the
  trigger queued the move and the whole folder (18 folders) was in People > Neath within a minute.
- 54 PASS. Renamed the person through Manage record: the folder was renamed. Renamed the Neath
  branch (in the database): the branch folder became "Neath ZZ", then "Neath" again when put back.
  Found: a branch rename only reached the drive with the next job for a record in it, so 0442 adds
  a trigger that queues that job the moment a branch is renamed.
- 55 PASS. Briefings, Complaints, Incidents and Policies unchanged.
- Note: the other "ZZ TEST ... (Swansea)" folders left loose in People and Service Users are copies
  from before Bevan's drive location was changed during testing. BCC no longer knows them, so it
  cannot move them. Test leftovers only; Thistle starts clean.

## Thistle Care Ltd, SharePoint, first live run (9 Oct 2026)

Phil connected Thistle to the Thistle Care SharePoint site (Shared Documents > Be Care Compliant)
and pressed Copy everything so far at 22:20. Checked by Claude, read only, inside Be Care
Compliant only, after the queue emptied.
- PASS. The SharePoint site choice worked first time (the only part not tested on Bevan).
- PASS. 452 jobs done, none failed, no errors.
- PASS. People > Cardiff (16) and Newport (34); Service Users > Cardiff (12) and Newport (59). That
  is every current record (50 people, 71 service users), each in its own branch, matching the
  database exactly. Thistle Care Ltd Office has no records, so it has no folder.
- PASS. Every record folder has its category folders; no file loose at the top of a section, a
  branch or a record.
- PASS. 208 files in record folders: 165 staff forms, 33 service user forms, 1 uploaded file, 1
  certificate, 3 meeting invitations and 5 outcome letters, exactly what the database holds.
- PASS. Spot checked file by file: Jamie Meredith (Cardiff) 12 files, Phillip Mccarthy (Cardiff) 3
  files, each in the right folder (absence forms, meeting records and the outcome letter in
  Absence; Right to Work in Right to Work; Individual Plan Review in Care Plan Review).
- PASS. Briefings (1 memo) and Incidents (1 report) filled; Policies and Complaints empty because
  Thistle has none yet.
