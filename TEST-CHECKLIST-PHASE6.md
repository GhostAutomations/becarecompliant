# TEST CHECKLIST — Phase 6: Notifications & reminders

Run as popups, one check at a time, Pass / Fail / Not tested. Anything Not
tested is logged into Phase 11 Final Testing. Prerequisites: code deployed to
Vercel, migration 0043 applied (done 2026-07-11), env vars set (CRON_SECRET;
TWILIO_* for SMS checks; RESEND_* already live from Phase 1).

## A. Settings and metering surfaces

- [x] A1. PASS 2026-07-12. /settings shows Notifications and Usage tiles; both pages load with a Back link.
- [x] A2. PASS 2026-07-12. Notifications page shows the digest toggle ON and SMS OFF by default (seeded settings row).
- [x] A3. PASS 2026-07-12. Saving thresholds validates: second chaser must be later than the first (error shown, nothing saved).
- [x] A4. PASS 2026-07-12 then AMENDED (Phil): numbers are entered naturally as 07700 900123 and normalised server side to +447700900123 (E.164, leading 0 dropped, Twilio requirement). RETEST after deploy: 07700 900123 saves and shows as +447700900123; garbage like "0123" is rejected; clearing works.
- [ ] A5. With TWILIO_* unset, the Notifications page shows the "SMS not configured" notice.
- [ ] A6. Usage page shows the zero state before any metered events.
- [ ] A7. Run an AI policy parse (Settings > Absence): a usage_events row appears (kind ai, tokens) and Usage page shows it this month.
- [ ] A8. Founder console shows the Usage tile; /founder/usage lists per-company usage (Founder login).
- [ ] A9. A Manager (non-admin) cannot open /settings/notifications or /settings/usage (requireCompanyAdmin redirect).

## B. Cron security and gating

- [x] B1. PASS 2026-07-12. GET /api/cron/daily-digest with no Authorization header returns {"error":"Unauthorized"} in production.
- [ ] B2-B4. LIVE-RUN TEST (agreed 2026-07-12, Terminal curl approach abandoned): the real crons prove these. In BST the 06:00 UTC entry fires at 07:00 UK and sends; the 07:00 UTC entry fires at 08:00 UK and the London gate must skip it. Phil checks: ONE digest around 07:00, NOTHING at 08:00. Claude verifies notification_log after 08:15 UK: daily_digest rows status sent from the first run, no duplicate rows from the second (gate returned skipped before any claims). notification_log confirmed empty before the first live run.
- [x] B5. PASS 2026-07-12. Vercel dashboard shows both cron entries after deploy (Phil confirmed).

## C. Daily digest content and scoping

- [ ] C1. Admin receives one digest listing amber + red items across the whole company, branded shell, CTA button (no plain links), no dashes in copy.
- [ ] C2. Manager receives only their branch's items (user_branches scoping).
- [ ] C3. Supervisor receives only their assigned caseload (people + service users).
- [ ] C4. A recipient with nothing due-soon or overdue receives NO email.
- [ ] C5. Leavers, archived people, and non-active or archived Service Users appear in NO digest (complete a leaver's check state to verify exclusion).
- [ ] C6. Team Members receive nothing, ever.
- [ ] C7. notification_log rows written (kind daily_digest, status sent) and visible logic holds: Admin can select their company's rows, Manager cannot.

## D. Chasers and SMS escalation

- [ ] D1. An item 7+ days overdue triggers one chaser email (kind chaser_7) to Managers + Admins; re-running the cron does not re-send.
- [ ] D2. At 14+ days a chaser_14 sends; an item discovered at 20 days overdue sends ONLY chaser_14 (highest level).
- [ ] D3. With SMS ON and a phone set, a 14+ day item sends one SMS; usage_events gains a sms row with segments; Usage page updates.
- [ ] D4. With SMS OFF (default), no SMS goes even for very overdue items.
- [ ] D5. SMS to a second number: each recipient gets their own SMS, each metered separately.
- [ ] D6. Completing the overdue check then re-running the cron: no further chasers for that instance (new due date = clean state).

## E. Calendar invites (the two carried items)

- [x] E1. PASS 2026-07-12 (BST date; GMT-date .ics check logged to Final Testing). Bookings carry TIME and DURATION (migration 0044); reviewer email with invite.ics gives a timed event at the right Europe/London time and duration.
- [x] E1b. PASS 2026-07-12. The Book in popover stays open showing "Booking…" until the save lands, then closes.
- [ ] E2. Re-saving the same booking (same date + time + reviewer) does NOT re-send; changing the date OR time DOES send a fresh invite.
- [ ] E3. Clearing a booking sends nothing.
- [ ] E4. REWORKED (Phil, 2026-07-12): Book meeting (stage, WHO IS HOLDING IT (Manager/Admin dropdown, required, migration 0047), date, time, duration) sends the employee and the chosen conductor the FORMAL LETTER invitation with a timed .ics; the employee letter names the conductor and includes purpose and right to be accompanied. Requires the person to have a Personal email.
- [ ] E4b. Record meeting sends NO emails, and when an open booking exists for that person/stage the Evidence attaches to it (history shows one meeting, success message says "recorded against the booking").
- [ ] E4c. Booking a past date is rejected with a clear message pointing to Record meeting. The card shows "Stage N meeting booked: date at time" until recorded, and the booking advances the meeting stage immediately (agreed behaviour).
- [ ] E4d. 48 HOUR NOTICE (Phil, 2026-07-12): booking inside 48 hours is rejected server side with a clear message; the date picker will not offer dates inside the window.
- [ ] E4e. ACCEPT (migration 0046): the employee letter has Accept and I cannot attend buttons. Accept opens the public response page (no login), one click confirms, the card shows "Invitation accepted", and the booker gets an "Invitation accepted" email.
- [ ] E4f. DECLINE: choosing I cannot attend requires a reason before sending; the card shows "Invitation declined: reason" and the booker's email includes the reason.
- [ ] E4g. Response safety: answering a second time (or reopening the link) says it has already been answered; a made-up token shows "This link is not valid"; simply OPENING the link never records a response (a POST is required, so email scanners cannot auto-accept).
- [ ] E4h. The booked line on the card shows who is holding the meeting ("held by X").
- [ ] E4i. CANCEL / REARRANGE (migrations 0048/0049): the Cancel / rearrange button (right of Record meeting, matching pill style) opens ONE popup: rearranging picks a new slot, location and conductor, resets any earlier response, and sends fresh letters marked as replacing the old invitation (slot-based dedupe); cancelling confirms, removes the booking (stage drops back) and emails both invitees "Meeting cancelled". A recorded meeting can do neither.
- [ ] E4k. LOCATION (Phil): booking and rearranging require a Location (address or Teams); it appears in both letters, in the calendar entry (.ics LOCATION) and on the response page.
- [ ] E4l. CONDUCTOR LETTER rewritten: it must read unambiguously as "you are chairing this meeting for X", never as if the conductor is subject to the procedure; their calendar entry is titled "Absence meeting with X (Stage N)".
- [ ] E4m. Cards are wider (2 per row on large screens) and all five buttons (Add absence, View absence, Book meeting, Record meeting, Cancel / rearrange) sit on one row.
- [ ] E4j. Reopening Book meeting straight after a successful booking stays open with a clean form (no instant self-close).
- [ ] E5. Audit metadata on the booking/meeting records the invite outcome (sent / already_sent / skipped_no_email_config).

## F. Holiday emails

- [ ] F1. Submitting a holiday request emails the branch Manager(s) and Admin(s) with a Review the request button.
- [ ] F2. Approving sends the requester "Holiday approved" with the dates.
- [ ] F3. Declining sends "Holiday declined" including the decline reason when given.
- [ ] F4. Deciding the same request again cannot re-email (dedupe key holiday_decision:<id>).
- [ ] F5. Book-on-behalf (Manager booking for a person) sends no emails (out of scope by design).

## G. Recurrence and timezone edges

- [ ] G1. Digest lands at 07:00 UK in BST (06:00 UTC cron) — verify after deploy in summer; log to Final Testing for a winter (GMT) check of the 07:00 UTC entry.
- [ ] G2. An item due today is amber (due soon), not overdue; it becomes red tomorrow (check_rag London boundary).
- [ ] G3. usage_monthly buckets a send near midnight UTC into the correct London month (inspect a row if available, else Not tested).

Untested items at sign-off go to PHASES.md Phase 11 Final Testing with enough
detail to run cold.
