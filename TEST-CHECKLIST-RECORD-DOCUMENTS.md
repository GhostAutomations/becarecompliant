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

## Results
