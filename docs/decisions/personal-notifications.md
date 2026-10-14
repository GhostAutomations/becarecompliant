# Per person notifications (Phil, 2026-10-14)

Thistle's Supervisors asked to be told when a Care Plan Review is completed, so they know to go and
do the audit. Notifications are set per person, by the Company Admin (or the Founder).

## What Phil decided

- **What can notify:** "[Check] completed" for every People and Service User check type the company
  has, listed from its own check definitions. The event type is a column, so more kinds of event can
  be added later without rebuilding.
- **How:** every notification goes into the person's **Recent activity** tile on their dashboard.
  **Email** is an extra tick per check type (Email always comes with Recent activity). No SMS.
- **Who sets it:** Company Admin and Founder only, enforced in the database. A Registered Manager or
  the person themselves cannot change anyone's notifications.
- **Where:** Settings, Users, a user, Notifications: one row per check type with two ticks, and a
  Branches list.
- **Branches (popups 2026-10-14):** a person is told about every branch they belong to (their own
  branch and any additional branches); "own branch" means all of them, not just the main one. The
  Admin can add a branch, and **adding a branch also gives the person access to it** (an additional
  branch, as in their login settings). Admin, Responsible Individual, Registered Manager and
  Recruiter cover the whole company.
- **Never about a record they can't open:** only roles that can open other people's checks can be
  notified (Admin, Responsible Individual, Registered Manager, Branch Manager, Supervisor,
  Recruiter). Viewers, On Call and carer logins never can. A department switched off for their role
  in Roles, users and access is not reached either.
- **Default:** every Supervisor, current and future, in every company, starts with "Care Plan Review
  completed" on for Recent activity, Email off. Everything else is off for everyone.
- **The old Recent activity tile** (company wide audit lines that only Admins could read) is
  **replaced** by the personal one (popup). Admins still have the Audit log under Reports.
- **The tile:** on every dashboard, that person's notifications only, newest first: what, for whom,
  by whom, when, branch. Clicking opens the Evidence. Remove hides it for that person only; twice
  does nothing. Live. Empty state: "Nothing new. Completed checks you're notified about will appear
  here."
- **Email:** the existing sender, branded, with an "Open it" button. Says what, for whom, by whom,
  when; never the form's answers. Once per notification (notification_log dedupe
  `check_completed:<notification id>`). A missing RESEND_API_KEY or RESEND_FROM is shown on the
  Notifications section and logged as skipped.
- **Test companies (popup 2026-10-14):** completion emails go out for test companies too, a third
  exception beside login invites and password resets (see framework-readiness.md, the standing
  rule). They are sent without the company, the same way invites are.
- **Archived records, leavers and discharged service users** don't notify; paused ones (hospital,
  respite, leave) do. The person who completed the check is not told about their own completion.

## How it works (0473)

- `notification_preferences`: explicit choices only; no row means the default
  (`notification_default_in_app`). Written only by `set_notification_preferences`.
- `user_notifications`: one row per person per completion, unique on person, check and Evidence.
  Read by that person only (RLS). `dismiss_user_notification` is their Remove.
- `notify_check_completed`: AFTER UPDATE OF last_evidence_id on check_instances, only when a check
  gets new Evidence. That is every real completion (forms and paper evidence both go through
  complete_check) and never an import or history date (`seed_migrated_completion` leaves
  last_evidence_id empty), never a retry with the same Evidence, and never a back dated form older
  than the latest (complete_check files it as history and leaves the check alone).
- Who: `lead_branch_ids_for(profile)`, the same rule as the RLS fast lane `my_lead_branch_ids`.
- Email: `lib/notifications/completion-email.ts`, called after the audit entry in the three
  completion paths (People form, Service User form, paper evidence). It never fails a completion.
- Live: the 0418 broadcast triggers (table name only) and `DashboardLive`; REPLICA IDENTITY FULL.
