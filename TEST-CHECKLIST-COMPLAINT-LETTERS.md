# Test checklist: complaint responses as signed PDF letters (THE LIST 54) and Book meeting (55), 2026-10-12

Phil's decisions: `docs/decisions/complaint-letters.md`. Migration 0448 applied (drafts kept on the
complaint, the letter PDF kept on each response); security advisor: no ERROR, nothing new. A sample
letter drawn locally before deploying and looked at.

| # | Check | Result |
|---|-------|--------|
| L1 | 55: someone who has had every stage shows "Every stage has been held." and no Book meeting; others keep it | PASS (live, Chrome as Bev Admin: ZZ Stage One B and C say it; the other cards still offer Book meeting) |
| L2 | Opening the Initial Response drafts nothing and spends nothing | PASS (Bevan complaint BC28091: the box opened with a Draft the letter button, balance unchanged) |
| L3 | Draft the letter: the whole letter in the editor matching the PDF; RE line with the reference; Dear and the name; the AI's own greeting and sign off removed; sender's signature, name and job title | PASS ("RE: Your complaint, reference BC28091", "Dear" and the complainant's name, Bev Admin, Registered Manager, signature) |
| L4 | The draft is kept: reopening shows it and costs nothing | PASS (closed and reopened: the same words, no Draft button; balance 108 to 107 for the one draft only) |
| L5 | Post: Save and print keeps the PDF on the complaint, records a postal response, opens the PDF to print; audit logged | PASS (response row method post with the PDF and its sha256; audit "Kept the initial response letter to print and post", the signature use, and the download; the PDF opened in a new tab and reads correctly) |
| L6 | Email: Approve and send; a test company keeps it marked not emailed | PASS (a test email set on BC28091: the send box named it; Approve and send kept a response row method email with the PDF, sent_at empty; contact put back afterwards) |
| L7 | The response page opens the kept PDF and says whether it went | PASS ("Initial response (letter by email)", Open the letter (PDF); after the fix, live dpl_H6udM: "Kept, not emailed" and "Kept 12/10/2026") |
| L8 | The full Complaint Response from a completed investigation | PASS (a ZZ TEST Complaint Investigation saved on Bevan BC28091; Draft the letter wrote the full response: what was investigated and found, upheld with an apology, the changes made, staff matters not disclosed, the Ombudsman; RE "Our response to your complaint, reference BC28091"; Save and print kept it with its PDF. Ticking investigation files on an email not tested: the test investigation has no files) |
| L9 | Dates in the AI's words in the letters' style ("26th September 2026", not "the 26th of September 2026") | PASS (live dpl_H6udM: a regenerated Initial Response wrote "26th September 2026" and "18th October 2026", no "the ... of") |
| L10 | A letter kept but not emailed leaves the box open so the reason can be read | PASS (live: Approve and send on a test company left the box open reading "Kept on the complaint. It was not emailed: Test company: emails and texts are switched off, so nothing was sent."; test email removed again afterwards) |
| L11 | "Dear" uses the title and surname ("Mrs Jo Example" is "Dear Mrs Example") | PASS by unit test (live from dpl_FenzD; Bevan's complainant has no title, so reads as before) |
| L12 | A kept letter is copied to the cloud drive's Complaints folder | Not tested live (Bevan's drive is disconnected; Thistle's next complaint letter will be the first. Built and typechecked; the first full copy of a newly connected drive includes them) |
| L13 | A file uploaded on a complaint form is kept (and an incident form's) | PASS after a fix found here (13 Oct, live dpl_Bovdh: before, complaint and incident forms kept only the file's name; nothing real was lost, no Thistle form ever named a file. After: a ZZ TEST investigation on BC28091 kept "ZZ TEST rota extract.pdf" as an uploaded file) |
| L14 | Ticked investigation files go with an emailed Complaint Response | PASS (the box offered the file, ticked, Approve and send on a test company: kept, not emailed, audit "attachments: 1"; test email removed afterwards) |
| L15 | Every letter editor uses the standard box, the two pages level, the formatting bar beside "The letter" | PASS (Book meeting, outcome letter and complaint letter measured level; the meeting form was too narrow with the bar on two lines, so it now opens as wide as Book meeting with the same boxes: pages 694px each, bar on one line, level) |

