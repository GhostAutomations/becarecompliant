# Phase 13 — Operation Thistle: defect log

Every defect real use exposes, logged as it happens. The rule for this phase (Phil,
2026-08-18): **fix the PRODUCT, not the tenant.** No Thistle special-casing, no hand-patched
rows — if something can only be put right with hand-written SQL, the defect is in the product.

And the standing rule for judging a fix: **look at the artefact, not the code.** Nothing moves
to PROVEN on the strength of `tsc`, a passing test or a green deploy. It moves when the screen,
the row, the file or the third party's own dashboard has been looked at.

| Status | Meaning |
|---|---|
| OPEN | Found, not yet fixed |
| FIXED | Code changed and deployed, NOT yet proven on the artefact |
| PROVEN | Verified on the real screen / row / file / Stripe dashboard |

---

## DEF-001 — "Suspend" and "Archive" did nothing at all  ·  FIXED

**Found** 2026-08-18, reading the guards while designing company deletion.

`companies.status` was written by the founder console (`setCompanyStatus`), printed as a pill on
two screens, and **read by no guard anywhere in the product**. `requireCompany` checked the
user's own profile status and the trial clock and nothing else. So suspending a company moved a
word on a screen: every one of its users carried on signing in and working exactly as before.

Severity is higher than it looks. Suspension is the lever you pull when a customer stops paying,
or when something has gone wrong and access needs to stop — and the founder would have believed
it had stopped. A control that says it cuts off access and does not is worse than no control.

**Fix:** `companyIsLocked` (pure, unit tested, `lib/companies/deletion.ts`) →
`isCompanyLocked` (`lib/billing/trial-gate.ts`) → checked in `requireCompany` **before** the
trial gate, because a shut company is shut whether or not its trial has time left. A read that
fails reads as `active`, so a database blip can never lock a working company out. Locked users
land on `/company-closed`.

**To prove:** suspend a company in the founder console, sign in as one of its users, confirm the
closed screen. Then activate it and confirm they are back.

---

## DEF-002 — A company could not be deleted, anywhere  ·  FIXED

**Found** 2026-08-18, when Phil asked for the two test companies to be removed.

There was no delete path in the product at all — not in the founder console, not in settings.
The only way to remove a company was hand-written SQL, which by this phase's governing rule
makes it a product gap rather than a data job. It is also a **UK GDPR gap**: a customer who
leaves, or who exercises the right to erasure, has to be erasable through the product.

Worse, a plain `DELETE FROM companies` would not have erased them. Sixty-two tables CASCADE, but
**five do not — `profiles`, `audit_log`, `sms_opt_outs`, `stripe_events` and `trial_requests` all
SET NULL** — so the logins, the staff names and emails in the audit trail, the mobile numbers on
the STOP list and the Stripe payloads would all have been left floating with nothing to say
whose they were. The **53 storage objects** (evidence PDFs, signed policies, absence policies)
would have survived untouched, exactly like the "anonymised record that kept a full PDF of
itself" found in August.

**Proof that the orphan hazard is real, not theoretical:** `ppdavies+bcctest@gmail.com` is a live
profile in the database with `company_id` NULL and role `team_member` — left behind by an
earlier removal.

**Fix (migration 0209 + `lib/companies/`):** a two-stage delete agreed by popup.

1. **Delete** — the company is locked out immediately (DEF-001's gate), any live Stripe
   subscription is cancelled **immediately, no refund, no proration**
   (`cancelSubscriptionNow`), and a **tombstone** row is written to `company_deletions`
   recording who deleted it, when, what it held and what happened to the subscription. The
   tombstone deliberately has **no foreign key** to `companies`: a record that cascades away
   with the thing it records is not a record.
2. **Purge** — 30 days later (nightly, on the 02:30 cron) or on demand via **Purge now**: the
   storage objects go first *while the rows that name them still exist*, then the auth users,
   then the five SET NULL tables, then the company itself. It then **counts what is left** —
   rows and bucket objects — and writes that onto the tombstone. A leftover is reported as an
   error, and the cron answers **500**, because "nothing was due" and "this has been broken for
   months" must never look the same from the outside.

Restore is available for the whole grace period; it says plainly that the subscription does not
come back.

**To prove:** delete a company, confirm its users are locked out and Stripe shows the
subscription cancelled; then purge it and confirm the bucket prefix is empty, the auth users are
gone, and the tombstone carries the counts.

---

## DEF-003 — A company created through the founder console has no regulator  ·  OPEN (unverified)

**Spotted** 2026-08-18 in the data, not yet proven on the screen.

`Bevan Care Ltd`, created through the founder console on 17 Aug, has `regulator` NULL and
`framework_enabled` false. A UK care company answers to CQC or CIW; a tenant that states neither
cannot have its inspection framework, and several screens key off the regulator (the dashboard
score once defaulted to the wrong one, which is already a fixed defect).

**Next step:** create a company through the console and watch whether the regulator is asked for.
If it is not, the fix is in the provisioning form, not in Bevan's row.
