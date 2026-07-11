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

- [ ] B1. GET /api/cron/daily-digest with no Authorization header returns 401 in production.
- [ ] B2. With the correct Bearer CRON_SECRET outside 07:00 London it returns {"skipped":"Not 07:00 in London"}.
- [ ] B3. With ?force=1 and the secret it runs and returns the JSON summary (companies, digestsSent, chasersSent, smsSent, skipped, failures).
- [ ] B4. Running ?force=1 twice in a row: the second run sends nothing new (all claimed, skipped counts rise). Idempotency proven.
- [ ] B5. Vercel dashboard shows both cron entries (06:00 and 07:00 UTC) after deploy.

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

- [ ] E1. Booking a SU Planned Review with a reviewer sends the reviewer a branded email with invite.ics; opening it on a phone/Outlook adds an all-day event on the right date (Europe/London date, no off-by-one).
- [ ] E2. Re-saving the same booking (same date + reviewer) does NOT re-send; changing the date DOES send a fresh invite.
- [ ] E3. Clearing a booking sends nothing.
- [ ] E4. Recording an absence meeting dated today or later sends the employee and their manager an invitation with .ics; a past-dated (retrospective) meeting sends nothing.
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
