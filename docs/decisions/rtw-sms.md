# Rtw sms

> Return to Work questions sent to the employee by SMS link to the portal (Phil's spec 2026-09-25). Read before touching RTW drafting, the /my portal RTW flow or SMS sends.

- [stated] 2026-09-25: "i dont want alerts to be sent by twillio, for now" — no overdue/escalation SMS alerts via Twilio for now.
- [stated] 2026-09-25 RTW flow wanted:
  1. Manager presses "Draft it for me" in a Return to Work; a "Questions to ask" section is created by the AI.
  2. Once drafted it STAYS saved on that specific Return to Work, so it stops using AI credits (no re-drafting each time).
  3. It then sends a text with a link to those questions in the employee portal.
  4. The employee must complete those questions.
  5. The answers come back to the Return to Work, and the Return to Work tile (dashboard) is updated.
- Related: [rtw-ai-questions](rtw-ai-questions.md) [rtw-open-issues](rtw-open-issues.md) [staff-logins](staff-logins.md) `bcc-friday-list` (not carried over)
- [stated] 2026-09-25 decisions (popup):
  - Link = secure one-off link, NO sign in: opens only these questions for that one absence, expires after 7 days, dies once answered, asks date of birth first.
  - Sending: "after who ever has pressed draft has checked it" — the person who drafted reviews/edits, then sends the text.
  - Answers back: "after supervisor or above has checked, if they are not happy with the answers, they should be able to call the employee and update the answers" — Supervisor+ reviews; can edit answers after a phone call; then records it as Evidence.
- [stated] 2026-09-25: the "Draft it for me" button at the top of the Return to Work has no AI icon; Phil wants one (reuse the app's existing AI icon if there is one).
- [stated] 2026-09-25 CHANGED: no date of birth / no-login check. "i like the secure link but it should make them sign into their portal, if they are already signed in, then they wont need to sign in". The text link opens the questions in their portal; signing in is required unless already signed in. (BCC stores no date of birth.)
- [stated] 2026-09-29 (R5 test feedback on the portal questions): if they answer that they have a fit note and haven't already uploaded it, they need to upload it there and then. "Is there any support" should be Yes/No, and if Yes, ask what they need. Same for Q8 ("anything else you would like to raise").
