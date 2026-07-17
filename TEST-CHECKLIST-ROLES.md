# Test checklist: Roles and permissions overhaul (Item 8)

Migrations 0077-0080 applied; code deployed (commit d3d4cdc). Helper functions and
RLS policies verified structurally via SQL. The checks below need real logins
(single-session, real JWTs) so they are logged for Final Testing.

Set-up: invite one user per role into a company with 2+ branches. Assign each a
single home branch (except the two Registered roles and Company Admin, which are
company wide). Put some records in a branch the branch-scoped users are NOT in.

## Registered Individual / Registered Manager (identical permissions)
- [ ] Sees People and Service User registers for ALL branches.
- [ ] Can complete checks, add/edit records, log absences, book and APPROVE holidays.
- [ ] Sees Reports, Training, Outcomes, Satisfaction, Complaints.
- [ ] Does NOT see Settings or Billing (Admin only).
- [ ] Title is the only difference between the two roles.

## Branch Manager (was Manager)
- [ ] Label reads "Branch Manager" everywhere (nav, Users list, invite dropdown).
- [ ] Sees only their own branch(es); cannot see records in other branches.
- [ ] Can approve holidays for their branch. No Settings/Billing.

## Supervisor
- [ ] Sees EVERYTHING in their branch (People + Service Users, full registers, not just a caseload).
- [ ] Can complete/edit checks and forms in their branch.
- [ ] Can log and edit absences (and book absence meetings) in their branch.
- [ ] Can submit a holiday for someone, but it lands PENDING (not auto-approved).
- [ ] CANNOT approve holidays (no approve controls; decide is blocked server-side).
- [ ] Does NOT see Complaints, Settings or Billing.
- [ ] Cannot see or act on records in a branch they are not assigned to.

## Viewer (was Team Member)
- [ ] Label reads "Viewer" everywhere.
- [ ] Sees ONLY People and Service User registers (their branch), read-only.
- [ ] No edit/complete/add controls anywhere.
- [ ] Cannot open Dashboard (redirected to /people), Holiday, Absence, Reports, Training, Complaints, Settings.
- [ ] Cannot see Evidence.

## Company Admin (regression)
- [ ] Unchanged: full access incl. Settings + Billing, all branches.

## Cross-cutting
- [ ] Existing manager/team_member users kept working after relabel (enum values unchanged).
- [ ] Notification gap (known): Registered roles do NOT yet receive the daily digest
      or holiday-approver emails (recipients still key on role='manager'). They see
      everything in-app. Fix when polishing notifications.
