# Phase 9 — Founder console — test checklist

Run as popups (Pass / Fail / Not tested), one at a time, once deployed. Anything
Not tested is logged into Phase 11 Final Testing.

## Dashboard (task 1) — DEPLOYED

1. `/founder` shows the stats row: total companies + active, committed MRR, active users + billable extra seats, this month SMS/AI usage.
2. Companies by tier counts match reality; status pills (active/suspended/archived) correct.
3. Sign ups over time bar chart renders, correct bars for the last 8 London months, empty state when none.
4. Numbers reconcile against the company list below.

## Per-company drill-in (task 2) — DEPLOYED

5. Clicking a company name opens `/founder/companies/<id>`.
6. Overview cards: billing state, seats used/included + cost, users active/total/pending, branches.
7. Billing panel correct for a subscription tier; Diamond shows usage only; Black shows free.
8. Metered usage table lists months with SMS/AI units and our cost.
9. Users list shows every profile with role + status; pending invites listed.
10. Recent activity lists audit entries; "Full audit" link opens `/founder/audit?company=<id>` and is actually filtered to that company.
11. Back link returns to the Founder console.

## Cross-company user management (task 3) — DEPLOYED

12. Disable a Manager/Supervisor/Team Member from the drill-in: status flips, seat count re-syncs, audit row written as platform_admin.
13. Re-enable the same user: status flips back, seats re-sync.
14. Company Admin and platform admin rows show NO disable button.
15. Resend a pending invite: email sent (or a clear "email not configured" note), audit row written.
16. Revoke a pending invite: invite marked revoked, the invited (not yet active) profile disabled, audit row written.
17. Inline error shows if a write is refused (no silent no-op).

## Revenue (task 4)

18. `/founder/revenue`: committed MRR matches the dashboard; active subscriptions and payment-due counts correct.
19. Subscriptions table: tier, billing pill, seats (+extra), monthly, renews date all correct; "Cancelling" pill shows when cancel_at_period_end.
20. Diamond section lists Diamond accounts with this-month metered cost; note about the unset customer rate is present.
21. Black section lists Black accounts flagged free.
22. past_due / canceled companies surface with the right pill.

## Training templates (task 5)

23. `/founder/training-templates` lists the master catalogue ordered by sort then name.
24. Add a course (name + renewal + amber + mandatory/safeguarding): it appears; empty renewal = one off.
25. Edit a course (change fields + active toggle) and Save: change persists.
26. Deactivate a course: it no longer seeds a NEW company (create a test company, confirm it is absent); companies already seeded are unchanged.
27. Delete a course: removed from the catalogue; existing companies unaffected.
28. Validation: adding with a blank name is refused.

## Health console (task 6)

29. `/founder/health` dependencies grid: each env dependency shows Set/Missing correctly; header pill reflects the count missing.
30. Daily jobs card shows last notification activity time and a Recent / No send in 24h+ pill.
31. Failed email/SMS section lists `notification_log` failures with the error; empty state when none.
32. Stripe webhooks section lists unprocessed/failed `stripe_events`; empty state when all processed.

## Manage-as-company (task 7)

33. From a company drill-in, click "Manage as company": you land on that company's dashboard, the sidebar switches to the company nav, and an amber banner shows "Managing as <company>".
34. SINGLE-SESSION NOT BROKEN: while you are managing as the company, its real Admin (signed in on another device) stays signed in and is NOT bumped. Confirm by having the Admin session still work.
35. You can open the tenant's People and Service User registers and Settings, and act as their Admin (e.g. add a Person, complete a check), scoped to that company only, not any other company's data.
36. "Exit support mode" in the banner returns you to the Founder console and the banner disappears.
37. The session auto-expires: after 30 minutes the cookie lapses and the app returns to the founder view (banner gone) without an explicit exit.
38. Audit: `founder.manage_as.enter` and `founder.manage_as.exit` rows appear for the company, with your founder email.
39. A non-founder cannot forge entry: manually setting the `bcc_manage_as` cookie as a normal user has no effect (guards check the real role first).

## Cross-cutting / cold checks → log to Final Testing if not run now

- Cross-tenant isolation: a Company Admin cannot reach any `/founder/*` route (redirected/403).
- Mobile layout of the dashboard, drill-in, revenue, training templates and health.
- RAG/pill colour accessibility on the new screens.
- Diamond usage-to-invoice figure reconciles with `/founder/usage` for the same month.
