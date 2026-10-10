---
paths:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
  - "lib/**/*.tsx"
  - "lib/email/**"
  - "lib/notifications/**"
  - "lib/letters/**"
  - "lib/sms/**"
  - "lib/ai/**"
  - "lib/absence/**"
  - "lib/reg73/**"
  - "lib/reg80/**"
  - "lib/marketing/**"
  - "lib/**/*{email,letter,render,pdf,report,certificate,ics}*.ts"
---

# Customer copy, emails, texts and documents

- No dashes as punctuation in anything a customer reads: screens, emails, texts, PDFs, letters,
  invoices, marketing. Use commas, colons and full stops. A lone dash in an empty table cell is
  allowed.
- Never the words "item" or "board" ("Dashboard" and "Whiteboard" are fine). Use Record, Register,
  Check, Form, Evidence. People and Service Users stay distinct.
- Customer emails use branded CTA buttons, never plain text links. (This was reintroduced once on
  Join Care Now after being removed. Never again.)
- Emails silently do nothing without `RESEND_API_KEY` and `RESEND_FROM`, and texts need the Twilio
  settings: show the state in the UI and tell Phil about the dependency.
- Test companies (`is_test`, such as Bevan) send no emails or texts at all, except login invites
  and password resets.
- Anything AI drafts is checked by a person before it is sent or relied on, and every button that
  spends AI credits carries the gold "AI" chip.
- A document (PDF, letter, invoice) is not done until it has been rendered and looked at.
