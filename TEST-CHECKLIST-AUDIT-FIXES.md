# Test checklist: records stay in their own company (migration 0443, 11 Oct 2026)

From the security and bug audit of 10 October 2026 (report in BCC Documents,
SECURITY-AUDIT-2026-10-10.md). Phil chose by popup, 11 Oct 2026, to fix the cross-company group
first: F1 to F4, F6, F12, F14, F15, F19, F41, F51, and F74 because the clocks go back on Sunday
25 October. The rest of the findings are asked about one area at a time later.

What changed: the database refuses any row moved to another company, any link to another
company's branch, person, service user, Evidence, policy or login, and any stored file outside the
company's own folder. Downloads check the same before a file is opened. Complaint, incident and
invite forms say plainly when a posted branch, service user or person is not the company's. The
morning reports gain an 08:00 UTC backup run.

## Checked by Claude (11 Oct 2026, rolled back, Bevan and Demo only)

1. Pass. Every audit attack is refused: a person, absence or incident moved to Demo; a Bevan
   person, service user, absence or complaint linked to a Demo branch, person or policy; a planted
   invite into Bevan from Demo; a Bevan login linked to a Demo branch; Evidence filed on a Demo
   person; policy, training and care plan paths pointed at Demo's folder or using '..'; the two
   functions that listed or counted another company's records.
2. Pass. Ordinary work still saves: moving a person between Bevan branches, logging a complaint in
   an own branch, a plain edit of all 36 Bevan people, a carer filing Evidence on their own record,
   a file path in the company's own folder, creating a written policy ('pending' then its file).
3. Pass. Provisioning a brand new company and the full demo seed (50 people, 40 service users,
   620 checks, 1,438 Evidence, 1,031 training records, 4 policies) run with no refusal.
4. Pass. Live: 103 tables carry the rule, 19 path checks validated against every existing row,
   security advisor 0 errors and 3 warnings fewer. Typecheck, 1,769 tests and build pass.

## For Phil, after the deploy is READY (on Bevan, never Thistle)

5. Pass (Phil, 11 Oct 2026; audit log evidence.downloaded at 15:12 London, no runtime errors).
   Open an Evidence PDF from a person's record: it opens as before.
6. Pass (policy: Phil, 11 Oct 2026, policy.opened at 15:12 London. Signed copy: 11 Oct 2026, Bevan
   had no signed policy, so Claude in Phil's Chrome gave Gethin Lloyd (Bevan, Neath) a carer login
   at ppdavies+policysign@gmail.com and sent him "Mobile Phones and Social Media (test upload)"
   from Briefings; Phil signed in as Gethin and signed at 15:58 London; Claude opened the signed
   copy as Bev Admin at 15:59: page 1 the stored document, page 2 the signature page, audit
   policy.signed_copy_downloaded). Note: the office record has no link to the signed copy; it is
   linked only from the carer's own page, and the office sees the signature in Evidence history.
   The policy showed on Gethin's page only after a reload: THE LIST 44.
   Open a policy from Policies, and a signed copy from a person's record: both open.
7. Pass (certificate: Phil, 11 Oct 2026, training.certificate_downloaded at 15:13 London; care
   plan: Claude in Phil's Chrome, 15:18 London, the PDF opened from Bevan's own folder and the
   view was audit logged). Open a training certificate and a service user's care plan: both open.
8. Pass (Claude in Phil's Chrome, 11 Oct 2026, as Bev Admin): complaint BC11104 logged in Neath
   with a Neath service user; a near miss reported through the incident report form in Neath with
   the same service user, its report Evidence filed. Read back: every row in Bevan, branch and
   service user both Bevan's. Incident edit form: Pass (Claude in Phil's Chrome, 11 Oct 2026,
   15:50 London): the immediate action text changed on the test near miss and Save changes
   turned to Saved; read back, the change is stored, the incident is still Bevan's with Bevan's
   branch and service user, audit incident.updated.
   Log a complaint and record an incident in a Bevan branch, with a service user: both save.
9. Pass (Claude in Phil's Chrome, 11 Oct 2026, 15:23 London, as Bev Admin): a one page test PDF
   uploaded on a Bevan person's Documents tile as "Audit fix test (Claude, 11 Oct)", shown in the
   tile, then downloaded. Read back: the row is Bevan's, its path is in Bevan's folder, the file is
   in storage (642 bytes), audit log record_document.added then record_document.opened.
   Upload a document on a person's record and open it: it opens.
10. Pass (Phil confirmed the email arrived, 11 Oct 2026). Sent by Claude in Phil's Chrome, 15:30
    London, as Bev Admin: Settings, Users,
    Invite a person offers office roles only (carers get logins from their People record), so a
    Viewer for Neath was invited at Phil's test address. Screen: "Invite emailed to ...". Read
    back: invite pending in Bevan with Neath (Bevan's), email_sent_at set, the login invited in
    Bevan, its branch link to Neath passed the new user_branches rule. Phil to confirm the email
    arrived (it did). Invite a login with a branch from Settings, Users (test companies only send invites):
    it sends.
11. NOT YET RUN. Due **Monday 26 October 2026**, the first morning after the clocks go back
    (Sunday 25 October, 02:00 BST becomes 01:00 GMT). Run it that morning, after 08:15 London.
    Claude checks, read only:
    a. Vercel runtime logs for `/api/cron/daily-digest` on 26 October: the 06:00 UTC run answers
       "Before 07:00 in London" (it is 06:00 in London), the 07:00 UTC run sends, the 08:00 UTC
       run sends nothing new. All answer 200 (a 500 means a send failed: read its failures).
    b. `notification_log` for 26 October: each Thistle digest and report sent once, at about
       07:00 London; nothing sent for Bevan or Demo except invites and password resets.
    Phil checks:
    c. The Thistle morning reports arrived at about 07:00, once each.
    Pass: one of each, at 07:00 London. Fail: none, two of the same, or only at 08:00.

---

# Test checklist: role limits (migration 0444, audit step 7, 11 Oct 2026)

Phil's decisions by popup, 11 Oct 2026 (permission-boundaries.md, reg73.md, reg80.md,
audit-2026-10-decisions.md). Findings F3 (second half), F5, F7, F8, F9, F10, F11, F11b, F13, F16,
F44, F50, F52, F53, F55, F59, F60, F65, the direct briefing write gap and the three People saves
that failed silently. THE LIST 46 to 51 are parked and not built.

## Checked by Claude (11 Oct 2026, whole 0444 inside begin ... rollback, Bevan and Demo only)

1. Pass. Every builder's attacks and positive controls re-run together against the whole
   migration: holidays 57, checks and Evidence 66, schedules and history 56, briefings 43, care
   plan and Founder login 51, Reg 73, Reg 80, readiness and Planner 108.
2. Pass. Provisioning a new trial company and a demo company as the Founder, and the full demo
   seed (50 people, 40 service users, 620 checks, 1,438 Evidence, 185 closed briefings, 9 Planner
   bookings) run with no refusal. Deleting a login that added a record still works.
3. Pass. scripts/access-probe.sql for Supervisor, Recruiter, Branch Manager, Registered Manager,
   On Call, Viewer, carer and Admin: every step 7 row reads "as the tile promises". The leftover
   mismatches are the ones that were there before step 7 (an Admin with no branch, a carer's own
   rows, branch counts against company totals, the due reports view).
4. Pass. Parity, all companies, counts only: 707 checks completed with Evidence, 707 completion
   dates match, 706 due dates match (the one is a Demo row seeded by demo_check_history), no
   linked Evidence trips a stand down gate. Replay: 499 Evidence rows, 496 allowed, the 3 refused
   are all on test companies.
5. Pass (Claude, 11 Oct 2026, after 0444 was applied live): the parity check below gave linked
   707, done_match 707, due_match 706, as expected. 0444 applied first time (version
   20261011220745); security advisor 0 errors; new lints are the 3 helper functions the RLS
   policies call (can_approve_holiday_for, can_see_branch_planner, can_read_planner_booking) and
   INFO on the two service role only care plan file tables, all expected.

```sql
select count(*) linked,
       count(*) filter (where d.completed_on = ci.last_completed_on) done_match,
       count(*) filter (where (case when cd.recurring then d.next_due when ci.service_user_id is not null then ci.due_date end) is not distinct from ci.due_date) due_match
  from public.check_instances ci
  join public.check_definitions cd on cd.id = ci.definition_id
  cross join lateral public.check_dates_from_evidence(ci.id, ci.last_evidence_id) d
 where ci.last_evidence_id is not null;
```

## For Phil, after 0444 is applied and the deploy is READY (on Bevan, never Thistle)

All Not tested. Bevan is a test company, so no emails or texts are expected.

1. PASS (Phil, 12 Oct 2026; run by Claude in Phil's Chrome, Phil signed in). As ZZ Test
   Supervisor: booked ZZ Stage One 16 to 20 Nov 2026; it went to Pending requests with only
   Withdraw (no Approve, Edit dates or Cancel); read back pending, booked by the Supervisor, no
   decider; the approver email was logged as skipped (test company). As Bev Admin: Approve, Decline
   and Edit dates shown; Approve put it on the November calendar, decided by Bev Admin at 08:59
   London; Bev Admin booked ZZ Stage One B 7 to 8 Dec 2026 and it saved approved straight away.
   Test rows left on Bevan: those two holidays.
   Holidays. As the Bevan Supervisor, open People, Holiday and book a holiday for a carer in your
   branch: it says "Holiday booked, pending approval" and shows Pending with no Approve, Edit
   dates or Cancel. As the Bevan Admin, Approve it (it moves onto the calendar), then book one
   for another carer: it goes straight onto the calendar as approved.
2. PASS (Phil, 12 Oct 2026; run by Claude in Phil's Chrome as ZZ Test Supervisor). Spot Check on
   ZZ TEST Branch Folder Person (Swansea) dated 13 Oct: "The date on this form is in the future.
   Enter the date it was done.", every answer and the signature kept, no Evidence stored. Dated 12
   Oct with Fail: saved; read back last completed 12 Oct 2026, next due 19 Oct 2026, Evidence by
   the Supervisor at 09:29 London.
   Future dates. As the Bevan Supervisor, Complete a carer's Spot Check dated tomorrow: a message
   says the date is in the future and everything typed stays. Change it to today with Passed set
   to Fail and save: the record shows it done today, next due 7 days later.
3. PASS (Phil, 12 Oct 2026; run by Claude in Phil's Chrome as Bev Admin). Annual Appraisal for ZZ
   TEST Branch Folder Person dated 12 Oct 2026: read back, Appraisal next due 12 Oct 2027 and
   Supervision 1 due 31 Dec 2026 (80 days). Claude opened the form by its address although the
   record did not offer it (the cycle's Supervision 3 was not done); the form accepted it and the
   record's supervision card now looks muddled: THE LIST 53, an older gap, not step 7.
   Appraisal. As the Bevan Admin, complete an Annual Appraisal for a carer dated today: the
   Appraisal is next due a year from today and Supervision 1 is due 80 days from today.
4. PASS (Phil, 12 Oct 2026; run by Claude in Phil's Chrome, Phil signed in each login). As Bev
   Admin: sent Gethin Lloyd (Bevan, Neath) the policy Driving for Work, "Audit test memo to sign"
   and "Audit test memo to confirm", and sent then withdrew "Audit test memo to withdraw" (Are you
   sure, Yes; it left the sent list). Each send said emails are off for a test company. As Gethin:
   My briefings showed the three, not the withdrawn one; confirmed one, signed the memo and the
   policy by typing his name. Read back: policy and signed memo completed with Evidence filed by
   Gethin, the confirm memo completed with no Evidence, the withdrawn one cancelled. The signed
   copy (page 9 of 9) reads Signed by Gethin Lloyd, 12 October 2026 at 09:24, typed full name.
   The Admin's Briefings screen was not re-opened afterwards (it reads the same rows).
   Briefings. As the Bevan Admin, send a carer a policy, a memo that needs a signature and a memo
   to confirm, and withdraw a fourth sent by mistake. As the carer, sign and confirm them: the
   signed copy says "Signed by" the carer. Back as the Admin, Briefings shows them done and the
   withdrawn one gone.
5. PASS (Phil, 12 Oct 2026; run by Claude in Phil's Chrome as ZZ Test Supervisor). Re-run after
   the fix went live (deploy 42ac84e2 READY): start date 5 Nov back to 5 Oct saved, the Audit moved
   back to 5 Jan 2027 and the Supervision kept 31 Dec 2026. First run: Part 1: ZZ TEST Branch Folder Person's start date 5 Oct to 5 Nov saved; the Audit
   (not done) moved 5 Jan to 5 Feb 2027, done checks untouched, BUT the not yet done Supervision's
   due date (31 Dec 2026) was blanked. Cause, older than step 7: a moved start date, and saving a
   check setting, re-dated every not yet done check from the start date, and Supervision is not
   dated from it. Fixed (Phil, popup): only the checks the start date sets are re-dated
   (startSetsDue, lib/people/start-dated.ts). The test record's Supervision was put back to 31 Dec
   2026. Thistle checked: its 14 blank Supervision dates are all people still in probation, as
   expected. Part 2: Add a person with They already work here and Supervision 1 dated 13 Oct: the
   browser refused ("Value must be 12/10/2026 or earlier."), everything typed kept, nobody added.
   Start dates and history. As the Bevan Supervisor, move a branch carer's start date on a month
   and Save: their not yet done checks move by the same month. Then Add a person, tick They
   already work here, give a Supervision date of tomorrow: a plain message, nothing typed is
   lost, nobody is added.
6. PASS (Phil, 12 Oct 2026; run by Claude in Phil's Chrome). As Bev Admin: the Llanelli review
   opened (audit reg80.viewed 09:14 London); a draft has no Download button, so the PDF address was
   opened directly: a 4 page draft that reads correctly, audit reg80.exported 09:15 (copy moved to
   the Trash). As Gethin Lloyd (carer): the same PDF address showed only "Only Admins, the
   Responsible Individual, the Registered Manager and Branch Managers can open this report.", no
   PDF, no download, no audit export line.
   Reg 80. As the Bevan carer, paste the live address followed by
   /api/reports/reg80/49b0aae6-0258-45dc-a664-7c55dec74bff/pdf: one refusal line, no PDF. As the
   Bevan Admin, open that review and Download: it works (Claude then checks the reg80.viewed line).
7. PASS (Phil, 12 Oct 2026; run by Claude in Phil's Chrome as Bev Admin, Phil agreed to his
   address being typed). Settings, Users, Invite a person: a Viewer for Neath with the Founder's
   sign in address showed the refusal below and kept what was typed. Read back: no invite for the
   address, the Founder profile still platform_admin, active, no company; nothing in
   notification_log. (A first try did nothing because the section was folded shut, so the click
   never reached the form; not an app fault.)
   Founder address. As the Bevan Admin, invite a Viewer using the Founder's sign in address: "That
   email address already has a Be Care Compliant login, so it cannot be invited. Please use a
   different email address for this person." No email arrives; the Founder page still opens.
8. PASS (Phil, 12 Oct 2026; run by Claude in Phil's Chrome as Bev Admin). Berwyn Foulkes (Bevan
   test service user, Llanelli): Replace with a 642 byte test file named care-plan.pdf showed
   Uploaded; View opened the new file from its own new path. Read back: two rows in
   service_user_care_plan_files, the 9 Oct file replaced at 09:05 London and the new one current
   by Bev Admin, both in storage. The subject access export (16 files) held
   files/care-plan/2026-10-09_earlier_care-plan.pdf and 2026-10-12_current_care-plan.pdf and
   care-plan-files.csv listed both; Claude moved its downloaded copy to the Trash. Audit:
   care_plan_uploaded, care_plan_viewed, care_plan_downloaded, subject_access_exported.
   Care plan versions. As the Bevan Admin, Replace a service user's care plan with a file of the
   same name: "Care plan uploaded" and View opens the new file. Download the subject access
   export: files/care-plan holds both files and care-plan-files.csv lists both. Tell Claude which
   service user, so storage can be checked.

Also, lower risk: a carer's Change dates then Take back on an approved holiday restores it; the
Admin changes Spot check from 30 to 31 days in Settings and back; the Holiday form sent as a
briefing and completed by the carer leaves a Pending holiday; the Supervisor's Planner and
Whiteboard still show their branch's bookings.
