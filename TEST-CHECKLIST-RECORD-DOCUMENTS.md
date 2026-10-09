# Test checklist: Documents on a record (migration 0439, 9 Oct 2026)

Phil's request: a place on a People or Service User record for an ad hoc document, "a copy of an
email or a random copy of a certificate", in a tile next to Updates and above Absence, with Upload
in its top right corner and the number of documents. Decisions by popup, 9 Oct 2026:
- Who sees and uploads: the same people as Updates (the database's Updates audience).
- Removing: a Company Admin only, with a reason. The file is deleted; a line saying who removed it,
  when and why stays on the record.
- People and Service Users both.

Test on Bevan (writes), never on Thistle.

## The tile
1. Person record: the Documents tile sits in the Complaints and Updates row, next to Updates and
   above Absence, the same height. With none: 0 and "No documents yet. Upload a copy of an email,
   a certificate or a letter."
2. Service User record: the tile sits in the checks row beside Updates, over Manage record.
3. Cancelled Service User: the tile sits beside Updates, over History.
4. Leaver: the tile shows and Upload works.

## Upload
5. Upload opens a popup. Choose files; each file gets a Name filled in from its file name, which
   can be changed; Take off removes a file before uploading.
6. Refused, with what is allowed: a .zip or .exe; a file over 20 MB; more than 10 files; an empty Name.
7. One PDF with a note: "Document uploaded.", the count goes to 1, and it shows in the tile with
   today's date.
8. Three at once: "3 documents uploaded.", the count goes up by 3, the newest two show in the tile.
9. A saved email (.eml or .msg) and a phone photo (.heic or .jpg) upload and download.

## Download
10. Click a document in the tile: it downloads with its own file name. The audit log has
    "Opened the document".
11. View all lists every document, newest first, with who added it, when, the file name, size and
    note. Download works there too.

## Remove (Company Admin)
12. As a Company Admin, View all shows Remove. It needs a reason of at least 3 characters.
13. Removed: "Document removed.", the count goes down, and "Removed by X on date. Reason: ..."
    stays in its place with no Download.
14. A Manager sees no Remove.

## Who sees it
15. Manager: sees and uploads on the records they can open; not on their own Person record.
16. Supervisor: sees and uploads, as with Updates.
17. Carer (staff or senior login): no tile anywhere.
18. Support mode (the Founder managing as a company): sees and downloads; no Upload, no Remove.

## Behind the scenes
19. Cloud drive (when connected): an uploaded document is copied into the record's folder, named
    like the other record files, with (2) for a second of the same name the same day. A document
    removed before its copy ran is not copied.
20. Subject access export: documents.csv lists every document (removed ones with the reason) and
    files/documents holds the files still there.
21. Nightly run: an upload started and never saved is removed after a day; a removed document's
    file is gone from the bucket.

## Certificate for a training course (added 9 Oct 2026, Phil's follow on)
Decided by popup: the Upload asks "What is this for?", an ad hoc document or one of the person's
training courses; a course takes the date completed and updates the training dates; training
courses only (DBS and Right to Work keep their own forms). On a cancelled Service User the tiles
now start from the left.
22. On a Person, as an Admin or Manager, Upload shows "What is this for?" with "An ad hoc
    document" and the person's training courses (only those for their job title). On a Service
    User, and for a leaver, there is no such choice.
23. Picking a course: the popup says where the course stands now, takes one file (PDF, Word or
    photo, under 4 MB), asks the date completed (not in the future) and shows the renewal date.
24. Save certificate: "Certificate saved to <course>."; in Training the course shows the new dates
    and View current certificate opens the file. The Documents count does not change.
25. A booking on or before the date completed is cleared; a later booking stays.
26. The certificate is copied to the cloud drive as a training certificate.
27. Cancelled Service User: Updates and Documents start in the first column, with no gap.

## Results

Run by Claude on 9 Oct 2026, after the deploy of 18b1e8e6 was READY and migration 0439 was
confirmed applied (3 tables, 4 functions, the private bucket at 20 MB, the select policy, the trash
trigger). Live in Bevan as Bev Admin (Company Admin), in Chrome.

- 1 PASS. Rhodri Evans: Complaints, Updates, Documents in one row, all 152px high, above Carer
  login, Holiday, Absence. Empty state wording as written.
- 2 PASS. ZZ TEST Service User Two: Setup Visit, Audit, Updates, Documents in one row (180px);
  the third check moved to the next row; Documents sits over Manage record.
- 3 PASS. ZZ TEST Paper SU (cancelled): Updates over History, Documents over Manage record.
- 4 Not run live (no leaver opened); the tile is outside the leaver branch, as Updates.
- 5 PASS. Upload popup: names filled in from the file names ("ZZ TEST DBS certificate", "ZZ TEST
  email from council"), file name and size under each, Take off, "Upload 2 documents".
- 6 PASS for a .zip (refused, naming what is allowed) and an empty Name ("Give each document a
  short name.", nothing else lost). Over 20 MB and more than 10 files: unit tests only (the popup
  uses the same rules).
- 7 and 8 PASS. Two at once with a note: the count went to 2, the newest two showed with today's
  date. Stored sizes and fingerprints match the original files exactly (sha256 checked).
- 9 PASS for a saved email (.eml, stored as message/rfc822). A phone photo not run live.
- 10 PASS. Clicking a document in the tile made a 5 minute link that returned the PDF (200,
  613 bytes, application/pdf, saved under its own name); audit "Opened the document".
- 11 PASS. View all: each document with Added date and time, by, file, size and note; Download
  and Remove; Upload in the footer.
- 12 and 13 PASS. Remove asked for a reason (Remove it stays off until one is typed); "Document
  removed."; then "Removed by Bev Admin on 09/10/2026 12:05. Reason: ...", no Download, count 1.
  The file was deleted from the bucket at once and nothing was left queued. Audit lines: added,
  opened, removed.
- 14 to 18 PASS AT THE DATABASE (rolled back probes as the real Bevan users): a Supervisor reads
  and adds on a Service User in their branch, and gets nothing on a Person outside it; a
  Supervisor's Remove is refused ("Only a Company Admin can remove a document."); the carer login
  (ZZ TEST Audit Starter) sees no documents and cannot add; a direct insert is refused. Also: an
  upload never started, a file outside its upload, reusing someone else's upload, a blank name and
  a blank reason are all refused; saving the same upload twice keeps one copy. The screens for
  these roles were not opened (Claude is signed in as Bev Admin only); Phil, 9 Oct 2026: the
  database proof is enough.
- 19 PASS. Copied to OneDrive in "Rhodri Evans (Llanelli)" as "RE ZZ TEST DBS certificate
  2026-10-09.pdf" and "RE ZZ TEST email from council 2026-10-09.eml", and on the Service User as
  "ZTSU ZZ TEST DBS certificate 2026-10-09.pdf". The removed one stays in OneDrive, as the
  popup says.
- 20 PASS. Subject access export for Rhodri: documents.csv lists both (the removed one with who,
  when and why) and files/documents holds only the file still there.
- 21 PASS AT THE DATABASE: retention erased a leaver's documents 8 years on, the trigger queued
  the file, other records untouched. The nightly run itself was not run.

Fixed after the test: Remove now shows the removed line the moment it saves, instead of the row
still offering Download and Remove for the few seconds the page takes to redraw.
