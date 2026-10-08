# Test checklist: Briefings, memos, messages and attachments (0435)

Built 2026-10-08. Test on Bevan (emails muted) as Bev Admin, then as a Bevan carer with a login.

| # | Check | Result |
|---|-------|--------|
| N1 | Briefings page shows "Send a policy or a form" and "Send a memo or message" side by side; policy sending still works as before || PASS 8 Oct (Bev Admin) |
| N2 | Send a Memo to one chosen person, "Read and press I have read this", no files. Shows under Memos and messages sent, "0 of 1 confirmed" || PASS 8 Oct, showed "0 of 1 confirmed", "0 opened" |
| N3 | Memo PDF opens on the company letterhead: logo, office address, MEMO, To/From/Date/Subject, the paragraphs || PASS 8 Oct, opens as a PDF (200); layout checked by rendering the same component with Bevan letterhead |
| N4 | Send a Message to a whole branch, "Just read it", with a due date || PASS 8 Oct, Neath, 6 people, due 16 Oct; empty message refused with "Write the message." |
| N5 | Send an Attachment with a PDF, a Word file and a picture, "Sign it". A fourth file is refused; a .zip is refused; a file over 10 MB is refused || PASS 8 Oct, .zip refused, 3 files uploaded and download byte for byte, Attach button hides at 3. Over 10 MB not tried |
| N6 | Carer: My page lists all three with the right wording ("Memo · To read and confirm" etc.) | |
| N7 | Carer: opening the "Just read it" message completes it straight away; manager sees it read with the date | |
| N8 | Carer: memo, "I have read this" completes it; manager sees "opened" and then "confirmed" with dates | |
| N9 | Carer: attachment files open and download; Sign it saves a signature; Policy Acknowledgement evidence appears on their record | |
| N10 | Carer: read notices appear under "Memos and messages" and "Read again" works | |
| N11 | Who has responded PDF shows done and outstanding, with "Opened" for opened but not confirmed || PART 8 Oct, PDF returns 200; content not looked at yet |
| N12 | Withdraw on the sent row removes it from everyone still to do it; per person Withdraw on Outstanding still works || PART 8 Oct, Withdraw for everyone on the message took it off all 6. Per person withdraw not tried |
| N13 | A carer cannot open another notice's file or memo by changing the link (404) || PART 8 Oct, unknown notice id and file 0 or 4 give 404; staff side not tried |
| N14 | Real company (not Bevan): the email arrives with the right subject and an "Open my briefings" button, and no memo text in the email | |
| N15 | Overdue notice is chased by the daily digest like a policy | |

Fixed after the 8 Oct run: old "Sent" or error lines now clear as soon as anything is changed; a file problem shows under Files, not by Send; on the test company the result says emails are switched off instead of "1 could not be emailed".
Still to test: N6 to N10 and the staff half of N13 (need a Bevan carer login), N14 (real company email), N15 (overdue chase).
