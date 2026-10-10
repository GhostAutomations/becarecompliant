# Founder inbox

> The Founder email inbox inside BCC (Inbox / Sent / Other / Deleted tabs) and Phil's decisions about how mail is sorted. Read before touching the founder inbox.

- [stated] DMARC aggregate reports (Google noreply-dmarc-support and the Microsoft "[Preview] Report Domain" / "DMARC Aggregate Report" ones) should be filed under the Other tab automatically, not the Inbox (Phil, popup 2026-09-28). BUILT 2026-09-29: isDmarcReport in lib/founder/inbox.ts (sender contains "dmarc" or subject "Report Domain: ... Submitter: ...") feeds looksAutomated, which sets is_spam = Other; migration 0333 moved the 22 existing reports.
- [stated] New mail (including the forms help notes from the Getting set up forms question, which also go to Outlook) must appear in the founder inbox with no refresh (Phil, 2026-10-01).
