# Tier changes

> How a company changes plan (built 2026-08-13) — the shared rule, why the tier is written before Stripe, what the nightly reconcile heals, and the five defects review found. Read before touching companies.tier, billed_tier, any subscription line, or the billing reconcile.

## The gap this closed

`companies.tier` was written at creation and by trial provisioning **and by nothing else**. So:

- **No Business customer could ever upgrade to Pro.** A launch blocker hiding in plain sight.
- Moving a company onto Black meant hand-written SQL, with nothing to stop Stripe charging them.
- The app is **upstream of Stripe**: the webhook copies `billed_tier` FROM `companies.tier` and
  never derives the tier from the price, so a plan change made in the Stripe portal would not
  have moved the tier either.

Found 2026-08-13 while writing up Phase 13 (Phil: Thistle pays first, then moves to Black).

## The shape

- `lib/billing/tier-change.ts` — PURE. What moves are allowed, and what Stripe must be told
  (`swap_base`, `cancel_at_period_end`, `resume`, `none`). 11 tests.
- `lib/billing/base-item.ts` — PURE. Which subscription line is the plan (`pickBaseItem`), and
  whether it may be rewritten (`baseSwapDecision`). 13 tests.
- `lib/billing/tier-apply.ts` — `changeTier`, the one implementation, shared by both entry points
  so they cannot drift on what is allowed. NOT a server action: a `"use server"` file may export
  only async functions.
- Entry points: `changeCompanyTier` (founder company page) and `upgradeToPro` (the customer's own
  billing page, which shows the real new total from their own user and branch counts).

**Downgrades are deliberately refused** (Phil, 2026-08-13: "not yet, upgrades only"). Pro includes
6 users and 2 branches against Business's 4 and 1, so a company with 6 users and 2 branches would
save £20 on the base and pay £17.50 more in extras. That needs the new total on screen first.

**Moving to Black** changes the plan immediately and stops the subscription at PERIOD END. No
refund, no clawback, no money either way — they keep what they bought, and Black is a superset.

## THE TIER IS WRITTEN BEFORE STRIPE IS TOLD, and that is deliberate

There is no atomic option across a database and a payment processor, so the choice is which way
to fail. Tier first fails towards **undercharging**, which this product already decided is the
safe direction (`checkoutPriceProblem` refuses a sale rather than charge an amount nobody was
shown). Stripe first would charge Pro for Business — the failure a customer sees on a statement.
The nightly reconcile then heals the undercharging case.

**`billed_tier` must be written in the same breath.** `syncSeatQuantity` and `syncBranchQuantity`
read `billed_tier`, NOT `companies.tier`, and it is otherwise only ever written by the Stripe
webhook. Leaving it behind was a real overcharge (see defect 1 below).

## reconcileBilling (was reconcileBranchBilling)

Renamed 2026-08-13: it now checks the **plan line**, the **seat quantity**, the **branch
quantity**, and that **nobody on a free tier is still being charged**. The old name described a
third of what it does, and a job that quietly does more than its name says is how the next person
misses that it is the only thing standing behind a failed plan change. Called from
`/api/cron/invoicing`; the response key is now `subscriptions`.

The `if (!branchPriceId()) return` early exit had to go: the base and seat reconciles live in
that loop, and behind the branch guard they would never have run in a deployment without
`STRIPE_PRICE_BRANCH`.

## The five defects review found, in two rounds

None was visible to `tsc` or the tests.

1. **`billed_tier` not written.** A Business company with 6 users upgrading to Pro would have
   recounted extras against the OLD allowance of 4, found no change, written nothing, and kept
   charging £10 a month for two users Pro includes — indefinitely, because the nightly job did
   not touch seats at all. **The code comment claimed the extras were recounted.** Fixed at both
   ends: `changeTier` writes it (and refuses if that write fails), and the reconcile now syncs
   seats.
2. **Undoing a move to Black did nothing.** The move cancels at period end, so a Black company
   keeps a live subscription for up to a month. Moving them back said "nothing is charged" about
   a company still being charged, then cancelled them weeks later while they sat on a paid plan
   with everything unlocked. There is now a `resume` settlement (`resumeSubscription`).
3. **A regression the first fix introduced.** Putting the base price in the nightly reconcile made
   it swap whenever the price id merely DIFFERED from the configured one. Point `STRIPE_PRICE_PRO`
   at a new Price meaning it for new customers, and every existing customer would have been
   migrated onto it overnight, prorated, silently — and any grandfathered price rewritten.
   `baseSwapDecision` now rewrites ONLY a line carrying a price we recognise as some tier's base
   price. Anything else is somebody's deliberate arrangement; leave it and log it.
4. **The price guard protected one path only.** With a stale `STRIPE_PRICE_PRO` a customer was
   correctly refused while the founder screen silently moved them onto the wrong amount.
   `checkoutPriceProblem` now lives inside `changeTier`.
5. **"Tonight's reconcile will correct it"** was asserted for failures the reconcile hits
   identically every night for ever (unrecognised price, missing price id, ended subscription).
   Now said only of transient ones.

Also fixed: a failure to settle billing renders as an ERROR, not under a green "Changed"; the
founder picker no longer offers Business to a Pro company (the server refuses it every time); the
founder Billing panel no longer claims "no Stripe subscription attached" about a Black company
that still has one; and `stopBillingAFreeCompany` catches the one direction nothing watched — a
free-tier company still being charged.

## A defect the LIVE test found, on a real invoice

Moving Acme to Black and back worked in both systems, but a third line appeared: **"Extra Seat,
quantity 0, £0.00"**, printed on the upcoming invoice. `syncBranchQuantity` has always refused to
create a zero-quantity line; **`syncSeatQuantity` never had that guard**, and it did not matter
while it only ran when somebody was added — there was always a seat to bill. Making the plan
change and the reconcile call it is what fired it on a company with nobody over the allowance.

Both now refuse to create a worthless line AND **remove** one that has fallen to zero, rather
than setting it to 0 and leaving "0 × £5.00 £0.00" on every future invoice. Only when another
item remains: a subscription cannot have no items.

## Tested live, and what is NOT

**Tested 2026-08-13 on Acme**: move to Black (Stripe read "Cancels 13 Sept / Ends at period end /
Next invoice £0.00", no proration, no refund), move back to Pro (cancellation called off, next
invoice back to £76.50), and a real reconcile run that removed the stray seat line, left the
correct Pro base price alone and left the branch quantity alone.

**NOT tested live: Business to Pro.** Acme is the only company in the database and is already on
Pro; moving it down to test the way back is the one move deliberately refused. The rule and the
price guard have unit tests, but the Stripe base-price swap has never run against a real
subscription. **Thistle's first real upgrade is the place to watch it.**

Related: [stripe-prices](stripe-prices.md) [branch-billing](branch-billing.md) [operations](operations.md) [look-at-the-artefact](../process/look-at-the-artefact.md)
