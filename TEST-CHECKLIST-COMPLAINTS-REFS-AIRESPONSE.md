# Test checklist — Complaint reference numbers + AI Complaint Response

Feature area: Phase 10 Additions (Complaints). Deployed green, migrations 0071/0072 applied.
Thistle set to prefix **TC**, calendar days.

## Reference numbers
- [ ] REF-1: Complaints register — complaint #1 (raised 15/07) shows ref **TC15071** in the Ref column.
- [ ] REF-2: Open complaint #1 — page title shows the same ref **TC15071**.
- [ ] REF-3: Settings → Complaints — prefix field shows/accepts **TC**; hint reads "TC15071". Change it, save, confirm register updates.
- [ ] REF-4: A complaint on a different day/month renders the correct DD/MM (e.g. raised 03/08 → TC0308{n}).

## AI Complaint Response
- [ ] AI-1: On a formal complaint WITHOUT a completed Complaint Investigation form — the Complaint Response button is disabled/gated (needs investigation first).
- [ ] AI-2: Complete a Complaint Investigation form, then click Complaint Response — AI drafts a response using the investigation answers.
- [ ] AI-3: If the investigation had file uploads, you are asked which attachments to include on the email.
- [ ] AI-4: Send by email — recipient gets the response with chosen attachments; button turns green; response appears in Evidence history (date/title/person/View).
- [ ] AI-5: Record-as-letter path — saves the response as evidence (kind 'response') without emailing.

## Notes
Anything marked Not tested is auto-logged into the Final Testing phase.
