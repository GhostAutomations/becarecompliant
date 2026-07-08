# Phase 1 — Multi-tenant core: test checklist

Run as popups, one check at a time (Pass / Fail / Not tested). Anything marked
Not tested is logged into Phase 11 (Final Testing) in PHASES.md.

Prerequisite before any of these can be tested: code deployed to Vercel AND
migration 0002 applied (done) AND env vars set (SUPABASE_SERVICE_ROLE_KEY,
NEXT_PUBLIC_SITE_URL, RESEND_API_KEY, RESEND_FROM) AND Supabase redirect URLs
allowlisted AND mail.becarecompliant.com verified in Resend.

## Companies (founder)

1. Founder sees the Founder nav entry; a non platform_admin never does.
2. Create company: seeds exactly one Team (kind team) and one Branch (kind branch).
3. Create company with an invalid/duplicate slug shows a clear error, no partial company left behind.
4. Company create writes a company.created row to audit_log.
5. Suspend / archive / activate a company updates status and writes company.status_changed.
6. Seat display on a company shows used, included (4) and extra billable at £5 correctly (test with 3, 4, 5, 6 active users).

## Branches (admin)

7. Company Admin sees Settings; Manager/Supervisor/Team Member never see Settings.
8. Rename a branch persists and writes branch.renamed; the rename is scoped to the admin's own company (cannot rename another company's branch).

## Invites & onboarding

9. Admin invites a Manager/Supervisor/Team Member with a branch: invite row created (pending), branded email received with a CTA button (no plain link).
10. Invite email is not sent silently when RESEND is unset: UI shows "email not sent" and the invite is still recorded.
11. Resend button regenerates the link, re-sends, increments resend_count and last_sent_at.
12. Revoke button sets the invite to revoked and disables the not yet active profile.
13. Accept flow: click CTA -> /auth/confirm verifies -> /welcome -> set password -> lands on /dashboard as active.
14. After acceptance the pending invite flips to accepted and the seat count increments.
15. A brand new invited user is forced to /welcome until they set a password (cannot use the app while status = invited).
16. Company Admin cannot invite another Company Admin (role limited to Manager/Supervisor/Team Member), enforced in RLS not just UI.
17. Only the Founder can create a Company Admin (via company create or an admin-role invite from the founder).

## Roles & RLS (permission boundaries)

18. Team Member: signs in, sees only their own record/tasks, no other people's records, no service user data (verify once People/SU exist; for now verify no Settings/Founder access and no cross-tenant reads).
19. Supervisor: scoped to assigned caseload only (verify once records exist; for now verify branch assignment via user_branches and no admin access).
20. Manager: multi-branch assignment works (user_branches has multiple rows) and Manager cannot invite/change seats.
21. Cross-tenant isolation: a user of company A cannot read company B's companies/branches/profiles/invites/audit_log (RLS).
22. company_active_user_count returns null (not another tenant's number) when called for a company the caller does not belong to.

## Audit & single-session

23. audit_log rows are written for company.created, company.status_changed, invite.created, invite.resent, invite.revoked, invite.accepted, user.status_changed, user.role_changed, branch.renamed.
24. audit_log is readable only by that company's Admin and the Founder (RLS), and cannot be updated or deleted via the API.
25. Single-session still holds through the invite accept flow: accepting on a second device signs the first out with the clear message.

## Regression

26. Existing Phase 0 login, dashboard, People and Service Users placeholders still work and the design-system preview is gone from the dashboard.
27. typecheck clean (tsc --noEmit) and next build succeeds on Phil's machine.
