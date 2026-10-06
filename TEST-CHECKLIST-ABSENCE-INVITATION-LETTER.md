# Test checklist: absence meeting invitation letter (2026-10-06)

Run by Claude on Bevan (test company, emails off) in the Claude browser as Bev Admin.

| # | Check | Result |
|---|-------|--------|
| IL1 | Absence page: Action required (n) and Tracking (n) folded sections; a person with a meeting due sits in Action required | Pass |
| IL2 | Book meeting preview: subject uses the company meeting name ("Stage 2 disciplinary hearing"), short "Dear..., please find attached a letter" email with Accept / I cannot attend, note says the letter PDF is attached, the letter shown under the email | Pass |
| IL3 | After Approve and send: the meeting stays in Action required with "Stage 2 meeting booked" | Pass |
| IL4 | A copy row is kept (absence_meeting_letters), linked to the meeting, audit metadata letter_copy = kept | Pass |
| IL5 | Person record: "Invitation letter PDF" on the meeting line; Evidence history lists "Absence meeting invitation" with Download PDF | Pass |
| IL6 | The downloaded PDF: letterhead address and both phones, letter date, home address, Dear first name, RE line, date/time/length/where/held by, every counted absence with date, reason and days, consequences, accompanied, Yours sincerely, name and role, one page | Pass |
| IL7 | A meeting booked before copies were kept: "Keep a copy of the invitation letter" makes the copy dated the booking day, marked "Copy made afterwards" in Evidence history, button becomes "Invitation letter PDF" | Pass |
| IL8 | Real email delivery with the PDF attached (Thistle, emails on) | Not tested here: Bevan is a test company with emails off. Charlotte's next booking in Thistle proves it |

## Round 2: 15 tests on Bevan, after the cancel fix (2026-10-06, run by Claude as Bev Admin)

| # | Check | Result |
|---|-------|--------|
| R1 | Book Stage 1 at the office: preview, approve, copy kept and linked to the meeting | Pass |
| R2 | Book over Teams: letter says Microsoft Teams, letterhead stays the office | Pass |
| R3 | Person with no email: preview says it cannot be sent, copy still kept (skipped_no_email) for printing | Pass |
| R4 | Person with no home address: just their name under the date | Pass |
| R5 | Rearrange: second copy kept as "rearranged" with the rearranged note at the top, new time | Pass |
| R6 | Cancel a booking: meeting deleted, letter stays in Evidence history with Download PDF; cancellation notice uses the meeting name | Pass |
| R7 | Keep a copy for an older booking: dated the booking day, marked Copy made afterwards | Pass |
| R8 | Submitting Keep a copy twice makes one copy only | Pass |
| R9 | All 8 kept letters download as PDFs, 8 downloads in the audit log, unknown letter is 404 | Pass |
| R10 | Meeting name blank: "Stage 1 absence management meeting" in subject and letter | Pass |
| R11 | Settings, Absence: name saves and shows again; a dash is refused | Pass |
| R12 | Settings, Branches: phone saves; text refused and the typed value kept | Pass |
| R13 | Person record: Home address saves as lines and prints on the next letter | Pass |
| R14 | Record the booked meeting: moves to Tracking; outcome letter preview uses the meeting name | Pass |
| R15 | Evidence history filter lists Absence meeting invitation (and rearranged) with counts | Pass |
| Extra | Archived records stay off the Absence register | Pass |
| Regression | tsc, 1570 unit tests, 15 pages load (dashboard, people, holiday, absence, incidents x3, settings x4, records, policies, service users), subject access export includes absence-meeting-invitations.csv, no runtime errors in the last hour | Pass |
| Found and fixed | Home address placeholder showed a real employee's address; replaced with a made-up example; her name and address removed from code comments and a test | Fixed, not yet pushed |
