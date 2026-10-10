# Company deletion

> How a company is deleted and erased (built + PROVEN end to end 2026-08-19, migration 0209): the two stages, the tombstone, the company LOCK that fixed Suspend doing nothing, why the company row is deleted BEFORE the logins, and the eleven defects the work exposed. ACME IS PURGED. Read before touching companies.status, companies.regulator, company_deletions, requireCompany, deleting any auth user, or the 02:30 cron.

Built at the start of Operation Thistle, 2026-08-19, because Phil asked for the test companies to
be deleted and **there was no delete path in the product at all**. By this phase's governing rule
that made it a product gap, not a data job — and a UK GDPR gap, since a customer who leaves has
to be erasable through the product.

## The two stages (agreed by popup, Phil 2026-08-19)

1. **Delete** — company hidden, every login locked out, **Stripe cancelled IMMEDIATELY** (no
   refund, unprorated: `cancelSubscriptionNow`). Nothing erased. A **tombstone** row goes into
   `company_deletions` with who/when/what-it-held/what-happened-to-the-subscription.
2. **Purge** — **30 days later** on the 02:30 retention cron, or **Purge now** from the founder
   console. Erases storage objects, the four SET-NULL-scoped tables, the company and the logins.

**Restore** works for the whole grace period and says plainly that the subscription does NOT come
back. Files: `lib/companies/deletion.ts` (pure rules, 13 tests) + `lib/companies/delete-apply.ts`
+ `components/founder/delete-company.tsx`. Migration **0209**.

## THE PURGE ORDER, AND WHY IT IS WHAT IT IS

Files → capture login ids + delete the four SET NULL tables (`audit_log`, `sms_opt_outs`,
`trial_requests`, `stripe_events`) → **the company row** → **then the logins** → stray profiles →
recount what is left.

- **The company goes BEFORE the logins** (changed 2026-08-19 after a real failure, DEF-010).
  **Deleting an auth user is not one row**: ~40 tables carry a user reference with ON DELETE SET
  NULL, so Postgres UPDATES all of them, and an update to a **finalised on-call log** is refused
  by the 0205 lock trigger (`created_by` is not on its allowlist). Four more are NO ACTION and
  block outright: `incidents.created_by`, `whistleblowing_disclosures.created_by`, and both
  `retention_hold_set_by`. Deleting the company first cascades all of that away.
- **The ids and company-scoped rows are captured FIRST**, because the company delete SET NULLs
  `profiles.company_id` and the other four — after it, nothing can be found by company id.
- **Files first of all**, while the rows naming them still exist.

## Things not to relearn

- **62 tables CASCADE from companies; FIVE DO NOT** — `profiles`, `audit_log`, `sms_opt_outs`,
  `stripe_events`, `trial_requests` are all **SET NULL**.
- **Both storage buckets are keyed by company id as the first path segment** (`evidence`,
  `absence-policies`), so erasure is a prefix purge — the list is hardcoded in `COMPANY_BUCKETS`
  and **a new bucket must be added there**.
- **Storage and auth deletions are NOT transactional.** An abort cannot claim nothing was erased
  (DEF-011: it did, while 53 files and 9 logins were already gone). Every abort now names what
  has already gone.
- **The tombstone has NO foreign key to companies**, on purpose.
- The typed company name IS the confirmation; the button stays dead until it matches, and the
  server re-checks.
- **Evidence PDFs are rendered ON DEMAND** (`lib/evidence/on-demand.ts`), so a company can hold
  evidence records and NO bucket objects until somebody opens a PDF.

## PROVEN END TO END, 2026-08-19

- **Delete**: run on Acme twice (once by Claude in error, once by Phil). Stripe's own dashboard
  read "Cancelled, ended 19 Aug 21:18"; **Restore** brought all 42 people / 346 evidence / 53
  files / 11 logins back and marked its tombstone restored.
- **Purge**: proven on two throwaways, then **on Acme itself** — company row, 53 files, 42 people,
  24 service users, 346 evidence, 1,084 audit rows, 19 Stripe events and all 11 logins gone,
  `purge_error` null.
- **Still unproven: the CRON path** (`by: "cron"`). Same function, different caller; nothing is
  now scheduled to exercise it.

## DEF-001, found doing this: "Suspend" never did anything

`companies.status` was written by the founder console, printed as a pill, and **read by no guard
anywhere** — a suspended company's staff carried on working. Now `companyIsLocked` →
`isCompanyLocked` → checked in `requireCompany` **before** the trial gate, with `/company-closed`
as the screen. An unreadable row reads as `active`. **PROVEN LIVE** both directions.

## The other defects this work exposed (all in DEFECT-LOG-PHASE13.md)

- **DEF-003 regulator** — was read everywhere, written nowhere. Now required on Create a company
  (CIW/CQC, no default) and founder-editable with an audit row. **Bevan still has none.**
- **DEF-005** — a new tenant could not add its first person (required Line manager, empty list).
  Phil's rule stands: **office team first, then people, then service users**; the dead end is now
  an explanation and a link.
- **DEF-006** — support mode offered Complete buttons whose save was refused. Hidden now, and all
  three complete routes answer with `components/support-mode-notice.tsx`.
- **DEF-004 / DEF-008 / DEF-011** — three screens stating facts they did not have.
- **DEF-007** — Purge now ended on a 404; fixed with a server `redirect()` to the list.
- **DEF-009 OPEN** — the invite guard only blocks poaching an **active** member of another
  company; an **invited** profile elsewhere is silently moved (company_id and role overwritten).
- **DEF-010 HALF OPEN** — fixed for the purge, **still live in Settings → Users**: a customer
  cannot delete a manager who has finalised an on-call shift or logged an incident. Fixing it
  needs the 0205 trigger to tolerate a user reference being NULLed, plus a decision on four NO
  ACTION FKs — one of which turns an attributed whistleblowing disclosure anonymous.

## Tenants as of 2026-08-19 (end of session)

**Acme Care Company: PURGED, gone.** Its logins went with it, including `(Phil's admin test login)` and
`(Phil's Thistle email)` — so that Thistle address is completely free.

**Bevan Care Ltd** is the only company left (Business, no subscription, no regulator, 1 login
`(Phil's Bevan admin login)`), kept as the empty second tenant for cross-tenant isolation tests.

Only other profiles in the database: the founder, and a pre-existing orphan
`(a test login)` (company_id NULL, from a removal months ago).

Related: [operations](operations.md) [project-state](project-state.md) [look-at-the-artefact](../process/look-at-the-artefact.md)
[permission-boundaries](permission-boundaries.md) [tier-changes](tier-changes.md) [retention](retention.md)
