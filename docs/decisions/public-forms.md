# Public forms

> BCC standing shift: Team Members won't have accounts; public web forms match to a Person by email

Standing decision (Phil, 2026-07-11): **Team Members will NOT have app accounts.** Instead, forms (starting with Holiday, then other TM-facing forms) are exposed as PUBLIC web pages linked from the company's own website "team area"; a staff member clicks the link, fills the form, submits, no login.

**Why:** Phil doesn't want to give every carer an app login; the workforce interacts via public forms hosted off the site, the same way his Monday forms work today.

**How to apply:** This revises the Phase 1 "TMs are invite-only accounts" model. It is NOT public self-signup (no account created, write-only submission). When built: public form page per company+form, secure rate-limited/honeypot submit endpoint (fail-safe, in middleware PUBLIC_PATHS, never service-role client), and MATCH the submission to a Person **by email** (people.work_email) — confirmed choice; no match -> hold in an "unmatched queue" for a Manager/Admin to link, never guess by name. The submission then creates the same Evidence + holiday_request/absence rows as the in-app flow. Logged as an Additions item in PHASES.md ("Public (no-account) forms for Team Members"). The Holidays & Absence in-app TM-self-request path may be replaced by this once built.

Related: [holidays-absence](holidays-absence.md) [permission-boundaries](permission-boundaries.md) [project-state](project-state.md)
