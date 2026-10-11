# Permission boundaries

> BCC role permission boundaries as ACTUALLY ENFORCED, verified against the live database 2026-08-14. Supervisor is branch-wide (not caseload), Viewer is the team_member role relabelled. Read before reasoning about who can see or do what.

**VERIFIED AGAINST THE LIVE DATABASE, 2026-08-14** (THE LIST item 12), by impersonating each
role's JWT inside rolled-back transactions. What follows is what the RLS actually does, not what
was agreed in July — two of the July rules had been deliberately superseded and this file still
carried the old ones.

## The nine roles

`platform_admin`, `company_admin`, `registered_individual`, `registered_manager`, `manager`,
`supervisor`, `team_member`, `on_call`, `staff`. **There is no `viewer` role: "Viewer" is the
`team_member` role relabelled** (migration 0079). Anything asking to "test the Viewer" means
team_member.

## Supervisor — BRANCH-WIDE, not caseload (changed by 0078)

~~Supervisor = assigned caseload only.~~ **Superseded by migration 0078 (roles overhaul stage
2).** `is_person_supervisor` and `is_service_user_supervisor` key on `user_branches`, exactly
like a branch manager. `person_assignments` is left in place but no longer restricts visibility.

Measured on Acme (a supervisor in Newport1 only, against a company of 42 people / 24 service
users / 358 checks / 345 evidence):

| | Sees |
|---|---|
| People | 7 — Newport1 only |
| Service users | 6 — Newport1 only |
| Checks | 69 — Newport1 only |
| Evidence | 30 of Newport1's 31 — the 31st is a COMPLAINT record, correctly withheld |
| Holiday requests | 3 — Newport1's only |
| Profiles | 1 — themselves |
| Complaints, incidents, whistleblowing | 0 |

Capabilities: **can complete a check in their branch, cannot in another**
(`can_complete_person_check` true/false). `can_manage_person` is FALSE — a supervisor completes
checks and files evidence but does not edit the person record. Not a branch manager, not an
admin. **Cannot approve holidays.**

## Viewer (team_member) — read only, their branch, no evidence

Migration 0079. Measured: people 7, service users 6, checks 69 (all Newport1 only), **evidence
0**, complaints 0, incidents 0. Every write refused: people, service users, check instances,
holiday approval — all zero rows.

## 2026-09-24 re-probe (list 12, migration 0323) — Phil's decisions

- [stated] Holiday requests: only for your OWN record, or made by Supervisor and above ("Own record, or Supervisor and above"). Enforced in holiday_requests_insert.
- [stated] "Viewers can never file a form": submit_evidence refuses role team_member. On Call keeps absence/complaint forms; carers (staff) keep own portal forms.
- Any member may REPORT an incident (0301, deliberate). scripts/access-probe.sql now takes v_as_role to probe a role nobody holds (role swapped in a rolled-back savepoint); Supervisor, Branch Manager, On Call, Viewer all 20/20 after 0323.

## 2026-10-03/04 audit decisions (Phil, popups)

- [stated] Carer login box on a Person record (audit B2): "Allow, own branch" — Supervisors and Recruiters see login status and send invites for people in their branch, same as who may add the carer (person_login_status uses is_branch_lead, migration 0379).
- [stated] Support mode (audit S4): "Keep Evidence company only" — Evidence is only ever signed by someone at the company, never filed in support mode; record edits, settings, users and forms stay open to the Founder in support mode, audit tagged.

## Holiday approval — who can, verified

`decide_holiday_request` is a SECURITY DEFINER RPC. **There is no UPDATE policy on
`holiday_requests` at all**, so nothing can approve through the ordinary client — testing a raw
UPDATE proves nothing, and that mistake was made once here before the RPC was found.

| Role | Own branch | A branch they do not manage |
|---|---|---|
| company_admin | approves | approves (company-wide by design) |
| registered_individual | approves | approves |
| registered_manager | approves | approves |
| manager | approves | **refused** |
| supervisor, team_member, on_call, staff | refused | refused |

So **the Registered roles DO have holiday approval** — via `is_company_wide` inside
`is_branch_manager`, not via a rule of their own.

**Decided by Phil, 11 Oct 2026 (popup, audit F7).** The table above was the agreed rule, but the
live database later let more in: since 0312 `can_manage_holiday` uses `is_branch_lead`, so a
Supervisor (own branch) and a Recruiter (every branch) could approve, including their own
holiday, by posting the action or calling the database. Phil confirmed the rule:
- [stated] Holidays are approved by a Branch Manager for their own branch, and by the Registered
  Individual, Registered Manager and Company Admin for any branch (the Founder in support mode as
  an Admin). Supervisors and Recruiters may book holidays, but what they book stays Pending.
- [stated] Nobody approves, amends into approved or books as approved a holiday on their own
  record; another approver must decide it.
Built in step 7 of the audit fix plan (role limits), in the database and in `decideHoliday`.
- [stated] 11 Oct 2026 (popup): an approver MAY cancel their own approved holiday straight from
  the Holiday page (cancelling is not approving). Approving, amending into approved and booking as
  approved stay refused on your own record.
- [stated] 11 Oct 2026 (popup): when a Supervisor or Recruiter books a holiday and it lands Pending,
  the approvers get the same "request waiting" email a carer's request sends (the company's email
  switch still silences it; test companies send nothing).

## Own record, check dates and history (Phil, popups 11 Oct 2026, audit step 7)

- [stated] Nobody, whatever their role, completes a check or moves a check's due date on their
  own People record. Carers keep only the forms their own page offers (holiday request, financial
  transaction, signing what is sent to them, forms sent to them as a briefing).
- [stated] A check's form cannot be dated in the future: refused with a plain message, the answers
  stay on the form. Holiday and absence forms are not checks and keep future dates.
- [stated] When a Supervisor or Recruiter corrects a start date on a record they may edit (own
  branch for Supervisors, every branch for Recruiters), that person's not yet done checks are
  re-dated, as for a Manager.
- [stated] Check history with no Evidence ("They already work here", the import): Company Admins
  and the Founder on any record; Managers, Supervisors, Recruiters and the Registered roles only on
  a person they added within the last hour. Service user history: Admins and the Founder only.
- [stated] Recruiters are not offered Complete on checks (the database never let them).
- [stated] On Call is not offered Record return to work; On Call keeps recording absences and
  absence meetings.
- [stated] Only the person a policy or briefing was sent to signs it; nobody signs on their behalf
  (a paper upload is THE LIST 50).
- [stated] Deleting a Person record deletes its linked login only when that login is in the same
  company and is not the Founder or a Company Admin. Admin logins stay managed in Settings, Users.

## Sessions — ONE DESKTOP AND ONE MOBILE, not one (0273, 2026-09-15)

~~Single session: signing in anywhere invalidated every other device.~~ **Superseded by migration
0273**, Phil's decision, after putting planner task links in people's Outlook and iPhone calendars
(see [planner](planner.md)) made the old rule unworkable: every tap on a phone signed the person out of
their laptop, and returning to the laptop signed out the phone.

`user_sessions` primary key moved from `(user_id)` to `(user_id, device_kind)`, kind being
`desktop` or `mobile`. `claim_session(p_session_id, p_device_kind)` upserts on the pair; the
one-argument form was DROPPED so no caller can silently keep the old behaviour. `requireUser` now
asks "is this session in one of MY slots" rather than comparing against a single row. Existing
rows became everyone's desktop slot, so nobody live was disturbed.

**What is preserved, and why it is keyed on KIND not a count.** The point of single session was
that a shared or left-behind login gets NOTICED because somebody is abruptly kicked out. A second
phone still evicts the first phone and a second computer still evicts the first computer, so the
tell survives. "Up to two sessions" would instead let two colleagues sit on a slot each
indefinitely, which is the thing being guarded against.

**The honest limit, stated in the migration and in `lib/auth/device-kind.ts`:** device kind comes
from the User-Agent, a client claim. Someone editing theirs holds both slots from one machine —
two sessions instead of one, for the account's own owner, which is what this decision allows
anyway. It is not a route into anyone else's account and **gates no permission**. iPadOS reports
as Macintosh and takes the desktop slot; that is documented, not a bug. All four claim sites pass
the kind: sign-in, invite confirm (usually a phone), welcome password set, and the guard's
self-heal.

## Unchanged from July, still true

- **User admin = Company Admin only.** Managers cannot invite users or change the seat count.
- **Form sign-off:** Managers approve any form in their branch(es); Team Members can complete
  but never approve.
- **Records are NOT accounts.** A Person or Service User is a compliance record, not a login:
  creating one never creates an auth user, sends an invite, consumes a seat or grants access.
  `people.profile_id` only associates a record with somebody who is ALREADY an invited user.
- Evidence CONTENT stays restricted; a Viewer sees the register and due dates, never the form
  contents.

## The technique, for next time

`begin; update profiles set role=…; set local role authenticated; set local request.jwt.claims =
'{"sub":"<profile id>"}'; …selects and attempted writes…; rollback;` — nothing survives, so it
runs against production data safely. Two traps, both hit on 2026-08-14:

1. **Confirm the fixture is not empty first**, or a pass proves nothing.
2. **A test that consumes its own fixture lies.** The first role to approve the only pending
   holiday left every later role failing with "request not found", which reads exactly like a
   correct refusal. Reset the fixture inside the loop.

**Why the original rules were tight:** GDPR (service user data is special category) and clean
billing control. Re-confirm any NEW permission edge with a popup before building that area.

Related: [roles-overhaul](roles-overhaul.md), [project-state](project-state.md), [look-at-the-artefact](../process/look-at-the-artefact.md)
