# SMS: one text, one SMS, one credit; balances only through the ledger; the Twilio balance

> Phil, 2026-10-15. Migration 0486. Read before touching any text the site sends, SMS credits,
> usage metering or the Founder console's SMS figures.

## Every text is one SMS

- [stated] Every send (sendSms for a company, sendPlatformSms for the Founder) goes through
  lib/sms/segments.ts: the text is made plain GSM 7 (straight quotes, hyphens for dashes, accents
  folded, emoji and other scripts removed) and must be one segment (160), checked BEFORE a credit
  is taken. Anything longer is refused with a clear error; nothing is ever sent as two.
- [stated] The texts (lib/sms/texts.ts) shorten their variable parts to fit, in order (company,
  then first name; for a ticket the subject first), never a link. Wording agreed by popup:
  - Return to Work: "Hi {first}, {company} has a few questions for your Return to Work meeting.
    Answer here: becarecompliant.com/s/{code}" (138 at the longest company name).
  - Overdue chaser: "{company}: {n} checks are {d} or more days overdue. Sign in to review:
    becarecompliant.com" ("1 check is" for one).
  - Ticket to the Founder: "Ticket {n} {rating} from {company}: {subject}." No link (Phil: "I
    don't need the link"); the subject is cut to fit.
  - Trial request to the Founder: unchanged words (already one SMS), now through the same check.
- usage_events.units keeps the segment count Twilio returns, so any drift shows. One credit per
  text.

## Short links

- [stated] becarecompliant.com/s/{code}: 8 characters from the public forms' unambiguous alphabet,
  random, nothing personal in it, stored in sms_links (service role only) with the path it opens
  and an expiry (the Return to Work link runs out with the questions, 7 days). /s is in
  PUBLIC_PATHS for the redirect only; the page it opens keeps its own sign in. Unknown or expired:
  "This link has expired".

## Credits and the ledger

- [stated] Thistle's balances corrected by popup: SMS 3,991 to 1,991 and AI 998 to 950, what their
  ledgers account for. Their records before 16 Sep 2026 (the first real import) were cleared,
  ledger rows included, and the balances were left; the logs that would show exactly how are gone.
- 0486: an SMS balance moves only by inserting a ledger row (trigger); any other change is refused.
  spend, grant (top up, refund, goodwill, adjustment) and the monthly grant keep their names,
  arguments, permissions and checks. credit_ledger_mismatches() lists any company whose SMS or AI
  balance is not its ledger; the Founder's health page shows it.
- [stated] Bevan's spend of 1 at 22:04 on 14 Oct was Claude's own test of spend_sms_credit during the
  goodwill job (it also spent 1 AI credit); no text was sent. Left as it is (popup).
- [stated] Black shows "Unlimited" on the dashboard tile and in Billing while any credit is left
  (popup); texts are still counted and credits still taken. At zero it shows 0 in red. Black has no
  top up button.
- [stated 2026-10-15] On the dashboard SMS tile the Left half of a Black company is a green
  infinity sign drawn half as large again as the figures (so it stands as tall as them), captioned "Unlimited" (the word at figure size ran out of the
  tile). Billing keeps the words "Unlimited texts".

## Test companies

- [stated] A test company texts only the mobile on a Founder profile (popup), so a test can be seen
  on a real phone and no real person is texted from a test company. A demo still texts nobody.

## Cost

- Twilio prices a text after delivery (sometimes up to a day). lib/sms/costs.ts reads back the last
  45 days' unpriced texts each morning: cost_pence when the account
  bills in pounds, and the price, currency and Twilio's segment count in the row's metadata.
- billing_usage_runs exists (0056) but nothing writes or reads it: Diamond usage is not invoiced by
  any code today.

## The Twilio balance (Founder console)

- [stated] A tile beside Usage: the balance in its own currency, from Twilio's Balance resource
  with the account's own SID and Auth Token, read on the server only, kept 15 minutes, streamed in
  on its own with a placeholder, 5 second limit, plain words when it cannot be read. Beneath it the
  credits held by customers (test companies left out); SMS sent this month is on the Usage tile
  beside it. Amber below 20, red below 10 (popup). Founder only.
- [stated 2026-10-15] The top line of the Founder console is one line of five tiles (Companies,
  Committed MRR, Active users, Usage, Twilio balance), all the same height. No "Checked at" and no
  Refresh on the Twilio tile: it reads Twilio again every 15 minutes on its own.
- Twilio alerts stay off.

## Every place a text is sent

| Where | From | Credit checked and taken | Refund on failure | Usage row |
|---|---|---|---|---|
| lib/absence/rtw-questions-actions.ts (Return to Work) | company, sendSms | yes | yes | yes, awaited |
| app/api/cron/daily-digest/route.ts (overdue chaser) | company, sendSms | yes | yes | yes, awaited |
| lib/tickets/actions.ts (new ticket) | Founder, sendPlatformSms | no company credit | not needed | no |
| lib/marketing/actions.ts (trial request) | Founder, sendPlatformSms | no company credit | not needed | no |
