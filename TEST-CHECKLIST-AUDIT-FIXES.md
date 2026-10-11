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
