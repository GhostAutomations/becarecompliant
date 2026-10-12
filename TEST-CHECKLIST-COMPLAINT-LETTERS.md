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
| L7 | The response page opens the kept PDF and says whether it went | PASS for the PDF button ("Initial response (letter by email)", Open the letter (PDF)); "Kept, not emailed" in place of "Sent" built after testing, goes live with the next push |
| L8 | The full Complaint Response from a completed investigation, with ticked investigation files on an email | Not tested (no Bevan complaint has a completed Complaint Investigation) |
| L9 | Dates in the AI's words in the letters' style ("26th September 2026", not "the 26th of September 2026") | Not tested live (unit tested; goes live with the next push) |
| L10 | A letter kept but not emailed leaves the box open so the reason can be read | Not tested live (built after testing; goes live with the next push) |
