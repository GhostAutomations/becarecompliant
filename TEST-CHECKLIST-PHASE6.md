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
- [x] B2-B4. PASS 2026-07-13 (first live run, verified by Claude). Both Vercel crons fired and returned 200: 06:00:24 UTC (07:00 BST, the send run) and 07:01:04 UTC (08:00 BST, the skip run). The London gate correctly skipped the 08:00 run, so there was no second batch, and dedupe keys make duplicates impossible regardless. B2 (07:00 sends): PASS as a healthy empty run. At 07:00 London the register held nothing amber or red, so zero daily_digest rows is the correct result: the People population had nothing due before 27 October, and every live Service User check was green (both "Setup" checks are non recurring and already completed so the status view forces green, the far future Care Plan Reviews are green, and the one MAR Audit that looked due sits on a deactivated check definition so the view excludes it). getAttentionItems reuses those exact status views, email_digest_enabled is true, and there are three active recipients, so the empty send was a genuine nothing due, not a fault. B3 (08:00 skips): PASS. B4 (no duplicates): PASS by construction. NOTE: because nothing was due, the actual send path (buildDigests, the branded email, the sent notification_log row) was not exercised end to end today. That content path is still covered by section C (seed an amber or red item and confirm one email and one sent row). SEEDED 2026-07-13 (Claude): Coke Can's Spot Check due date set to 2026-07-18, confirmed AMBER in person_check_status. The 2026-07-14 07:00 UK run must send one digest listing it; auto-verify task bcc-digest-cron-verify-2 reports at 08:30 and Phil confirms inbox arrival (covers C1).
- [ ] B6. GATE RELAXED (Phil, 2026-07-13): the London gate is now "from 07:00 onwards" instead of "exactly 07:00", so Vercel's manual Run button works any time of day and a missed morning self-heals; the per-day dedupe keys still make double-sends impossible, and the winter 06:00-London run is still refused. Test: click Run on the cron in Vercel (Settings > Cron Jobs) in the afternoon, digest sends if not already sent today; click Run again, nothing new sends (skipped count rises).
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
- [x] E4. PASS 2026-07-12 (final form). Book meeting (stage, conductor dropdown, date, time, duration, named-office location) sends the employee and conductor the formal letters with timed .ics.
- [ ] E4p. DECLINED IS NOT BOOKED IN (Phil, 2026-07-12, migration 0053): a declined open booking does not appear in Record meeting's Meeting Type options, does not drive prefills, cannot have Evidence attached to it, does not advance the meeting stage, and does not block rebooking that stage. It stays visible on the card with its reason until rearranged (response resets) or cancelled. Held meetings always count regardless of the invitation response.
- [ ] E4q. RECORD ONLY WHAT IS BOOKED (Phil, 2026-07-12, corrected: the button always stays visible): Record meeting's Meeting Type only ever offers booked-in stages, and shows an EMPTY list when nothing is booked in. The button itself never disappears.
- [x] E4b. PASS 2026-07-12, Claude-driven in Chrome, full loop verified: booked Stage 2 (dropdown offered ONLY Stage 2: min gate + derived-stage cap both working), Teams location, both letters sent (conductor letter titled "Absence meeting with Coke Can (Stage 2)"), response page showed details + location, Accept one click, card showed "Invitation accepted", conductor notified, Record meeting prefilled everything (Meeting Type Stage 2, conductor, date, purpose ONCE, absence level, count, stage-scoped dates "Absence 4: 21/12/2026 to 22/12/2026"), minutes not-required checkbox + upload present, save attached Evidence to the booking, no emails, booked line cleared, remaining Stage 1 booking surfaced. BUG FOUND AND FIXED during this run (migration 0055): unanswered bookings were excluded from latest_meeting_stage by SQL null logic (response = 'declined' is NULL for unanswered), so met. stage showed nothing and Stage 1 was offered again. Original spec: Job Title removed; Meeting Type first, options = booked stages only; conductor/date/purpose prefilled (purpose help caption removed in v3, it duplicated the prefill); Attendance Record Review prefilled, with the absence list numbered chronologically one per line (dd/mm/yyyy) and SCOPED TO THE STAGE (Stage 1 = absences up to its occasions threshold, each later stage = the new absences since the previous threshold, absolute numbering kept); Meeting Minutes section with a "Meeting minutes not required" checkbox. Recording attaches to the booking, no emails, booked line clears. TEST after deploy.
- [ ] E4c. Booking a past date is rejected with a clear message pointing to Record meeting. The card shows the booking until recorded, and the booking advances the meeting stage immediately (agreed behaviour). (Partially covered by the 48h picker test; log to Final Testing if not separately run.)
- [x] E4d. PASS 2026-07-12. Date picker refuses dates inside 48 hours (server enforces the exact hour cutoff).
- [x] E4e. PASS 2026-07-12. Accept: response page shows details + location, one click, card shows "Invitation accepted", conductor emailed.
- [x] E4f. PASS 2026-07-12. Decline: empty reason refused, reason recorded, card shows "Invitation declined: reason", conductor's email includes it.
- [x] E4g. PASS 2026-07-12. Answer-once enforced; tampered tokens rejected; GET never records a response.
- [x] E4h. PASS 2026-07-12. Booked line shows who is holding the meeting.
- [x] E4i. REARRANGE PASS 2026-07-12: replacement letters sent, card updated, earlier acceptance reset. CANCEL path not separately run tonight: log to Final Testing (confirm, booking removed, stage drops back, both invitees get "Meeting cancelled").
- [x] E4k. PASS 2026-07-12. Named-office location dropdown; full address in letters; card shows the office NAME after a comma (no brackets). Teams wording not separately run: log to Final Testing.
- [x] E4n. PASS 2026-07-12, then EXTENDED (Phil): the stage dropdown is capped at BOTH ends, nothing below (already held or booked in) and nothing above the person's derived stage from the company thresholds (only meetings their absence level calls for can be booked, e.g. Coke Can at 4 occasions offers Stage 1 and Stage 2 only). Server enforces both. RETEST after deploy.
- [x] E4o. PASS 2026-07-12. No Open button on employee emails; conductor copies keep it.
- [ ] E4l. CONDUCTOR LETTER rewritten: it must read unambiguously as "you are chairing this meeting for X", never as if the conductor is subject to the procedure; their calendar entry is titled "Absence meeting with X (Stage N)".
- [ ] E4m. Cards are wider (2 per row on large screens) and all five buttons (Add absence, View absence, Book meeting, Record meeting, Cancel / rearrange) sit on one row.
- [ ] E4j. Reopening Book meeting straight after a successful booking stays open with a clean form (no instant self-close).
- [ ] E5. Audit metadata on the booking/meeting records the invite outcome (sent / already_sent / skipped_no_email_config).

## F. Holiday emails

DECISION (Phil, popup 2026-07-12): F1 to F4 LOGGED TO FINAL TESTING, to be tested with the public no-account forms (Additions), which is how staff will really submit requests. Book-on-behalf (F5, no emails by design) verified structurally. Email infrastructure itself proven by the meeting letters (all arrived, Phil confirmed).

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
