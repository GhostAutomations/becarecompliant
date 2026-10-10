# Branch billing

> Extra branches — how they are counted, billed and (from 0181) removed. Read before touching branch counts, the founder branch screen, or anything that deletes a branch. The foreign keys onto branches will erase Regulation 73 and 80 records if you let them.

## What is billed

**Operational branches only.** `getBranchCount` counts `kind = 'branch'`; the office/team row
seeded with every company is NOT a branch and is never billed. Allowance is **Business 1, Pro
2, Black unlimited** (`includedBranchesForTier`). Beyond that, **£7.50 per branch per month**
(`EXTRA_BRANCH_PENCE`), as one subscription item whose quantity is "beyond the allowance" —
deliberately the SAME SHAPE as seats, so anyone who understands one understands the other and
there is one place to look when a bill is questioned.

Acme is the live example: three operational branches on Pro, so one extra at £7.50, on top of
Pro £69.00 = £76.50/month. See [stripe-prices](stripe-prices.md) for the price ids and the first real
subscription.

Three ways the quantity moves: the checkout line items at subscribe time, `syncBranchQuantity`
when a branch is added or removed, and `reconcileBranchBilling` nightly. The reconcile exists
because for a long time NO code path created a branch — every extra branch on the test company
was inserted by hand in SQL — so a sync that fired "when a branch is added" would never have
fired and would have LOOKED built while collecting nothing.

## The monthly total is ONE rule

`lib/billing/monthly-total.ts`, `subscriptionMonthlyPence`. Every component is a **required**
field, deliberately: the founder console once computed base + seats and forgot branches, and
reported £69.00 while Stripe billed £84.00. A required field means adding a fourth charge stops
the compiler at every call site instead of one screen quietly under-reporting. Both
`/settings/billing` and `/founder/companies/[id]` call it.

## Removing a branch — 0181, and why it is not a DELETE

Until 2026-08-13 Add was a one-way door: provision a branch by mistake and the customer paid
£7.50 a month for ever.

**A plain DELETE would destroy regulatory records.** The foreign keys onto `branches` are three
different rules and two of them lose data silently:

- **CASCADE** — `reg73_visits`, `reg80_reviews`, `user_branches`. Deleting a branch DELETES the
  statutory Regulation 73 visits and Regulation 80 quality reviews held against it. Measured on
  Acme: removing Cardiff1 would have taken **7 Reg 80 reviews and 6 Reg 73 visits**.
- **SET NULL** — incidents, evidence, check_instances, holiday_requests, whistleblowing,
  person_training and more. The rows survive but forget which branch they belong to, which is
  worse than useless in anything reported by branch.
- **RESTRICT** — people, complaints, invoices, invoice_schedules, planner_bookings, on_call.

So removal is an **UNDO for a branch created by mistake, never a way to erase history**.

`remove_unused_branch(p_branch uuid)` (SECURITY DEFINER, pinned search_path) is founder only
via `is_platform_admin()`, locks the branch row `FOR UPDATE`, counts references across all 26
referencing tables via `branch_blocking_references()`, and refuses if there is a single one —
check and delete under ONE lock so nothing can be inserted between them. The office/team row is
refused outright: every company needs somewhere for head office records to sit. Returns jsonb
`{removed, reason, blocked_by[], name}`; reasons are `not_permitted`, `not_found`,
`not_a_branch`, `in_use`.

`lib/branches/removal.ts` turns that into a sentence a founder can act on, naming the three
biggest blockers: *"Cardiff1 has records against it, so it cannot be removed. It still has 518
training records, 294 evidence and 188 checks. Move them to another branch first."* 8 tests.

The founder company page lists operational branches with a confirmed Remove on each, and
removal re-syncs the Stripe quantity down.

**Proved against the live database** on 2026-08-13, as the founder, inside a rolled-back
transaction: Cardiff1 `in_use` (17 kinds of record), the office row `not_a_branch`, a
nonexistent id `not_found`, and a company admin `not_permitted` on both a real branch and an
empty one — a company cannot delete a branch out from under its own records.

Related: [stripe-prices](stripe-prices.md) [look-at-the-artefact](../process/look-at-the-artefact.md) [permission-boundaries](permission-boundaries.md)
