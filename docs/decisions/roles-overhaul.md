# Roles overhaul

> BCC roles/permissions redesign — confirmed matrix, ALL FOUR STAGES BUILT 2026-07-16; notification gap closed 2026-07-27; only per-role live testing outstanding

Big role + permissions redesign (Phil, 2026-07-16), enforced in RLS not just UI. CONFIRMED MATRIX:
- **Company Admin** (`company_admin`): everything incl. Settings + Billing, all branches. Settings/Billing = Admin ONLY.
- **Registered Individual** (`registered_individual`, NEW) and **Registered Manager** (`registered_manager`, NEW): SAME permissions (different title only) — all branches, everything a Branch Manager can, but NOT Settings/Billing. Can approve holidays.
- **Branch Manager** = the existing `manager` role, just RELABELLED "Branch Manager" (kept enum value): own branch + additional branch views, no Settings/Billing, can approve holidays.
- **Supervisor** (`supervisor`, CHANGED): full access within their branch (view + complete/edit checks, forms, absences, submit holidays) but CANNOT approve holidays (their holiday actions stay Pending for Branch Manager+). Still must NOT see Complaints.
- **Viewer** = the existing `team_member` role, RELABELLED "Viewer" (kept enum value): read-only, People + Service Users ONLY, nothing else (no Complaints/Reports/Holiday/Absence/Training/Settings/Billing).

**ALL 4 STAGES BUILT 2026-07-16 (migrations 0077-0081 applied). This is NOT outstanding
build work — a 2026-07-27 session wrongly told Phil stages 2-4 were still to build. Only
per-role LIVE TESTING remains. See [tracking-drift](../process/tracking-drift.md).**

Stage 2 (0078): is_person_supervisor + is_service_user_supervisor redefined branch-based → supervisor sees + completes everything in their branch (can_complete_* use these); still NOT in is_branch_manager so no complaints/holiday-approval. Stage 3: decide_holiday_request already uses is_branch_manager (supervisor blocked); bookHolidayForPerson now creates status=pending for supervisor (approved for Branch Manager+); holiday page canApprove += Registered roles, new canBookForPerson (=canApprove||supervisor), holiday-view split (book picker for canBookForPerson, approve for canApprove); absence: 0080 adds supervisor insert/update policies on absence_events + absence_meetings, absence page canManage += Registered + supervisor. Stage 4 (0079): additive team_member SELECT policies on service_users + check_instances (Viewer sees SU register + RAG, evidence still excluded); nav Dashboard + Holiday gated to NOT_VIEWER; dashboard redirects team_member -> /people; Viewer read-only via MANAGE_ROLES exclusion. Also swept ~8 Reports/Training/Outcomes/Satisfaction gates to include Registered roles.

**NOTIFICATION GAP CLOSED 2026-07-27.** Previously recipients keyed on
role='manager'/'company_admin', so the two Registered roles received NO daily digest, no
chaser, no briefing overdue list and no holiday approver email — they saw everything in
app and nothing by email. Fixed in ONE place rather than at every call site:
`getRecipients` (lib/notifications/data.ts) now selects the Registered roles and
**NORMALISES them to `company_admin`** on the Recipient, because they are company wide
exactly like an Admin — so `scopeItems`, `scopeReporting`, `overdueForRecipient` and both
filters in the daily-digest route behave correctly with no further edits. `Recipient`
gained `trueRole` for transparency. lib/notifications/holiday.ts widened its own approver
query and its branch filter now keeps any company-wide role (previously only
`company_admin` survived the branch filter). settings-actions.ts lets the Registered
roles hold an SMS number. **Keep this normalisation in mind: anywhere that must treat a
Registered role differently from an Admin has to read `trueRole`, not `role`.**

LIVE TEST 2026-07-17: Registered Manager PASS in Chrome (all branches/26 records, full manage, Settings blocked+redirects). Supervisor + Viewer + Registered-holiday-approval logged to Final Testing (needs a login per role; single-session). TEST USERS were repurposed then RESTORED to normal (phil3107=manager, ficklephil=manager, seat1=team_member/disabled). To re-run cold checks: phil3107->supervisor(Cardiff1), ficklephil->registered_manager, seat1->team_member+active; restore after.

BUG FOUND + FIXED via 0081 (2026-07-17): profiles.role DOES have a check constraint (profiles_role_check). 0077 only updated invites_role_check, so accepting a Registered invite (writes role onto profile) would have FAILED the check. 0081 adds registered_individual+registered_manager to profiles_role_check. Live testing caught this.

STAGE 1 DONE 2026-07-16 (migration 0077): new RLS helper `is_company_wide(cid)` = company_admin/registered_individual/registered_manager, wired into `is_branch_member` + `is_branch_manager` so the two Registered roles get ALL branches with no policy rewrites (additive; existing manager/admin/team_member behaviour preserved; supervisor NOT in is_branch_manager so still no complaints). Code: lib/nav.ts (Role type + ROLE_LABELS relabel manager→Branch Manager / team_member→Viewer + add 2 roles + COMPANY_WIDE_ROLES + widened nav `roles` arrays); ~15 MANAGE_ROLES/COMPLETE_ROLES/COMPLAINTS_ROLES arrays across pages got the 2 Registered roles; invite-form + team-member-controls role dropdowns; INVITABLE_ROLES + InviteRole type.

See [permission-boundaries](permission-boundaries.md) (Phase 1 RLS rules this supersedes) + [tracking-drift](../process/tracking-drift.md).
