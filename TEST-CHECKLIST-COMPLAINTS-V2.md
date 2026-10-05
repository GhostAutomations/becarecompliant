# Test checklist: complaints Updates, Complaint Outcome, initial response by category (2026-10-05)

Phil (TC05101 at Thistle, popups): Updates on each complaint; close with an outcome stored as evidence; a per category setting for which complaints need an initial response (Minor Complaint and Concern off to start); the Complaint Investigation form on informal complaints too. Behind companies.complaints_v2, ON for Bevan only. Test on Bev, then roll out to Thistle, every company, trials and the Demo (and make it the default for new companies).
Migrations 0389a to 0389e applied (no DROPs: the tool refuses them).

| # | Check (as Bev, Bevan) | Result |
|---|-------|--------|
| V1 | Log a Minor Complaint, Informal: no initial response due date, the cell reads "Not needed for Minor Complaint", no Initial Response button, register shows no deadline | NOT TESTED |
| V2 | Same complaint: Investigation form offered (informal) and a Close complaint button | NOT TESTED |
| V3 | Post an Update on the complaint; reply; pin; edit; attach a file; @mention someone (the email names the complaint by reference, not the subject) | NOT TESTED |
| V4 | Status control offers Open and In Progress only; trying to close another way is refused | NOT TESTED |
| V5 | Close complaint: the Complaint Outcome opens with today and your name filled in; save; the complaint shows Closed with the date, the outcome is in the Evidence history, upheld shows on the named team member's record | NOT TESTED |
| V6 | Settings, Complaints: "Categories that need an initial response" ticks Complaint and Audit Identification; tick Minor Complaint, save; a new Minor Complaint gets a due date again; untick it, save: open minor complaints lose the due date | NOT TESTED |
| V7 | Change a complaint's category from Complaint to Minor Complaint on Edit: the due date clears; back to Complaint: a due date is worked out from the date raised | NOT TESTED |
| V8 | Thistle (switch off): TC05101 looks exactly as before (no Updates, no Close complaint), until roll out | NOT TESTED |
| V9 | Formal complaint on Bevan: initial response, investigation, response and Close complaint all offered | NOT TESTED |
| V10 | People and Service User Updates still post, reply, pin and edit as before (the functions they use were left as they were) | NOT TESTED |
