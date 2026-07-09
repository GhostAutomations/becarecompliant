# Phase 4 — Service Users (build brief)

Goal: the same compliance loop as People, for Service Users (the clients receiving care), reusing as much of Phase 3 as possible. Service User data is special-category health data under UK GDPR, so it is the most sensitive in the platform (strict tenant + role isolation, access audit logging on reads not just writes, signed URLs, discharged/cancelled excluded everywhere).

## Reuse from Phase 3 (do NOT rebuild, extend/share)
- Register matrix pattern: sticky first column, centred cells, dense rows, DD MMM YY dates, RAG cells, inline colour-coded pill dropdowns (portal menus), permanent horizontal scrollbar, search + sort by status, column shorthand labels in Settings.
- Views + Branches dropdowns: identical behaviour to People, loaded once and switched instantly on the client (Main / status views / Summary), URL kept in sync, "Summary" label. Branch auto-fill of manager/supervisors on Add, same as People.
- Record drill-down page, the compliance loop (complete Form -> immutable Evidence -> advance check via the shared recurrence engine), the shared forms engine (renderer, validator, conditional logic, per-slot / preset answers, activity-date completion), realtime live refresh, toast host, Back-to-view links, canonical controls, instant "Saving" button, client-side redirect after Server Actions (never redirect() to a query URL), on-demand evidence PDF.
- Security patterns: company_id + branch_id on every table, RLS helper functions, SECURITY DEFINER RPCs with pinned search_path and record-ownership checks, private storage + short-lived signed URLs.

## Service User record model
- name ("Service User"), ssid (text; the Social Services ID, unique within company), package_start_date (date), service_status enum (active / hospital / respite / cancelled), branch_id, discharge handling. Plus contact/identity fields TBC.
- Never mixed with People in UI or data model. Team Members never see Service User data unless explicitly assigned.

## Main view columns (in order, as specified)
1. Service User (sticky, left-aligned name; links to the record)
2. Package Start Date
3. SSID
4. Status — inline pill dropdown, options: Active / Hospital / Respite / Cancelled
5. Most Recent Review
6. New Review Due
7. Planned Review Date
8. Review Status — inline pill dropdown, options: Awaiting Review / Booked In / Overdue

## Views (mirror Phase 3's Main/Leavers/LTS/Archive)
Main (Active) + one view per non-active status + Summary. Proposed: Main (Active), Hospital, Respite, Cancelled, Summary. Cancelled behaves like Leavers (excluded from the active register, rollups, dashboard, reminders; kept for audit). Status pill moves a Service User between views, same instant behaviour as People.

## The Review workflow (columns 5-8)
The primary Service User check is the Care Plan Review (recurring). Most Recent Review = last completed review date; New Review Due = last review + interval (recurrence engine); Planned Review Date = the booked/planned date for the next review; Review Status reflects where that review is up to.

## Service User check types (record drill-down + seeded forms, from Phase 2)
care plan review, risk assessment, MAR (medication) audit, consent review are already seeded as templates. Additional SU checks TBC. Only the review columns are on the main table per the spec above; other checks live in the record drill-down (and optionally as extra columns later).

## GDPR / special-category (higher bar than People)
- Access audit logging on READ of a Service User record and its evidence (who viewed what, when), not just writes.
- Strict role isolation enforced in RLS; Team Members excluded unless assigned; Supervisors scoped to caseload.
- Cancelled/discharged excluded from active register, rollups, reminders, reports.

## Open decisions to confirm before building (see popup)
1. The view set (Main/Hospital/Respite/Cancelled/Summary) and which statuses are "excluded from active" like Cancelled.
2. How Review Status (Awaiting Review / Booked In / Overdue) is set: auto-derived from the due date + planned date, or a manual pill the manager sets, or a mix.
3. Whether the main table is review-only (these 8 columns) with risk assessment / MAR / consent in the record drill-down, or those checks also get columns now.
