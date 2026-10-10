# Stripe prices

> The authority on BCC prices — the £69 Pro fix, the £7.50 branch price and the first real subscription, every Stripe id, the price guard (unit test + health panel + checkout refusal), and the fact that Stripe is a SANDBOX. Read before touching any price, tier or billing copy.

**Supersedes the "Pro price" blocker in [self-serve-trial](self-serve-trial.md): the Stripe half is now done
in the sandbox, and only the Vercel env var is outstanding.**

## The bug, 2026-07-29

The pricing page said Pro was **£69**. `TIER_BASE_PENCE` said **9900**. Stripe held a **£99**
price created on 13 July. Phil confirmed Stripe was never touched when the two public tiers
were re-cut. So the first customer ever to press Subscribe would have been charged £30 a month
more than the website promised, and the trial lapse gate makes Subscribe the way OUT of a
lapsed trial, which is the worst moment to overcharge somebody. Nobody had subscribed, so no
real harm was done.

## The Stripe facts

Account **acct_1TfLB1RhL0XqZmTg**, a **SANDBOX** named "Test Bill 2" (the dashboard shows
"Exit sandbox" and "Verify your business"). ONE account holds the products for all three
businesses: Join Care Now, Carer Academy and Be Care Compliant.

- Be Care Compliant Pro: product `prod_UsGyAdP70lgEFP`
  - NEW `price_1TyYNLRhL0XqZmTgSwyF3uqm` = **£69.00 / month, GBP, flat rate** (created
    2026-07-29 by Claude through the Chrome extension, at Phil's request)
  - OLD `price_1TsWQoRhL0XqZmTgJcqpbPAg` = £99.00 / month, still marked Default, 0 subscriptions
- **Be Care Compliant Extra Branch: product `prod_V3r1ZqVtrF0mY0`, price
  `price_1U3jJcRhL0XqZmTgw2kLiVz0` = £7.50 / month, GBP, licensed not metered** (created
  2026-08-12). `STRIPE_PRICE_BRANCH` is set in Vercel, Production and Preview.
  **Do NOT confuse it with the pre-existing "Additional Branch" product
  `prod_UkaVgMOorbHeB5` / `price_1Tl5KWRhL0XqZmTgfFrGfm1B`** — that one has a live subscriber
  ("Thistle Care", £52.50 MRR) that is NOT in BCC's database. Leave it alone.
- Also present: Be Care Compliant Business £49, Enterprise £199, Extra Seat £5, AI credits top
  up £10, plus Ai Usage, SMS Usage and the other two businesses' products.

**Outstanding:** `STRIPE_PRICE_PRO` in Vercel still points at the £99 price. Only after it is
switched and redeployed should the £99 price be archived; archiving it first breaks Checkout.

**Before launch:** confirm which account and mode the production keys point at. If there is a
real live account, the whole BCC product and price set must be created there too. If the
account is not verified, BCC cannot take real money at all yet.

## The first real subscription, 2026-08-13

Acme subscribed from its own billing page. `sub_1U46BgRhL0XqZmTg008eTiyw`, customer
`cus_UsHKjszKYHkIur`, invoice `U6ZNESFB-0069` for **£76.50 paid** — Pro £69.00 × 1 and Extra
Branch £7.50 × 1, no seat line (2 active billable users against a Pro allowance of 6). The
webhook wrote the subscription id, `active` and the period end onto `company_billing`.

Then the founder "Add a branch" moved the branch quantity to 2 with prorations (+£15.00,
−£7.50), and "Remove a branch" moved it back to 1 with the prorations cancelling to nothing.
**This is the proof that the branch line actually bills**, in both directions.

Notes worth keeping:
- Sandbox subscriptions show "Auto-cancels" about 90 days out. That is Stripe test mode, not
  our code.
- `cus_UsHKjszKYHkIur` also holds a £199 "Subscription creation" from 13 July — the retired
  Enterprise tier, same company under its old name. Its `metadata.company_id` is Acme's.

## Two defects the first subscription exposed

**The Stripe customer kept its old name for ever.** `ensureCustomer` stored the customer id at
the first checkout and never looked at the record again, so Acme — set up as "Thistle Care
Wales" and renamed — still read Thistle Care Wales in Stripe a month later, and Stripe is what
prints on the invoice, the receipt and the card statement. Fixed: `ensureCustomer` refreshes
name and email when they differ, best effort so a rename can never stop somebody subscribing.
The decision is a pure module, `lib/billing/customer-identity.ts`, 7 tests — including that a
blank name never wipes one Stripe already holds.

**The founder console under-reported the bill.** Its BILLING tile computed base + seats and
forgot branches: £69.00/mo on screen while Stripe billed £76.50, then £84.00. The customer
billing page had been fixed for exactly this a fortnight earlier and the founder page was
missed — nothing was wrong in either file on its own, the defect was that there were two files.
There is now ONE rule, `lib/billing/monthly-total.ts`, with every component a **required**
field, so a fourth charge stops the compiler at every call site instead of one screen going
quiet. Both pages call it.

Also fixed the same day: `subscriptionHasEnded` (`lib/billing/subscription-state.ts`) in BOTH
`syncSeatQuantity` and `syncBranchQuantity`, so a cancelled subscription is skipped quietly
rather than retried, refused and logged as an error every night. Null is deliberately NOT
"ended": refusing on an unknown status would leave a real subscription unbilled for ever.

## The guard, so this cannot happen again

Three places hold a price and none of them could see each other. Now two are tested and the
third is checked at runtime:

1. `lib/billing/price-consistency.test.ts` fails the build when the public pricing page and the
   code disagree on any plan price, the £5 seat, the £7.50 branch or the £10 AI top up. It
   caught the Pro bug the moment it was written. It reads `lib/stripe/config.ts` and
   `lib/billing/seats.ts` as TEXT, because both import server-only code, the same trick
   `lib/ui/save-button.test.ts` uses on globals.css.
2. `lib/billing/price-check.ts` asks **Stripe** what each configured price actually is.
   `checkStripePrices()` powers a Billing prices panel on `/founder/health`. All five read
   "Matches" as of 2026-08-13.
3. `checkoutPriceProblem()` runs inside `startCheckout` immediately before the Session is
   created and **refuses the sale** when Stripe disagrees with the app, rather than charging an
   amount the customer was never shown. **Fails CLOSED on a proven mismatch, OPEN on a failure
   to read**, so a Stripe outage never stands between a customer and their account.

Two review catches worth keeping:
- The seat price is only checked when a seat line is actually going on that invoice
  (`includeSeat: extra > 0`). Otherwise a company inside its included users could be locked
  out of a lapsed trial by a line item it is not being charged for.
- A tier with no price id that is NOT on the public pricing page reads "Not sold" in neutral,
  not red. Enterprise is the live case. A health panel that is permanently red is a panel
  nobody reads, which is the exact failure the panel exists to fix.

Also: `AI_TOPUP_PENCE` is now a constant rather than a number in a comment, and
`STRIPE_PRICE_AI_TOPUP` was missing from `.env.example` entirely.

Related: [branch-billing](branch-billing.md) [self-serve-trial](self-serve-trial.md) [phase7-decisions](phase7-decisions.md) [project-state](project-state.md)

## Price review, 2026-09-29 (before a new client)
- [stated] Phil is thinking of changing prices before taking on a new client. Claude recommended (not yet agreed): Business £79 (£790/yr), Pro £129 (£1,290/yr, annual = 10 months), extra user £5, extra branch £25, AI top up £10, texts £20, onboarding £295 one off, waived on annual.
- [stated] Offer slogan chosen: "Start 2027 inspection ready. Free onboarding when you join by 31 December." Join = agreement signed and first payment by 31 December 2026; £295 from 1 January 2027.
- A local preview page with these numbers was built: iCloud Be Care Compliant/Claude outputs/pricing-preview.html. Live site, Stripe and code NOT changed.
- [stated] 2026-09-29 AGREED: go live with the new prices (Business £79, Pro £129, extra branch £25, extra user £5, top ups unchanged, onboarding £295 waived to 31 Dec 2026). Buttons say "Request a trial" (not Book a demo). Annual shown on the page (10 months for 12), set up by Phil manually until annual card billing is built. Trial requests also land in the Founder email Inbox (threaded, replyable), and the Trial requests list stays.
- [stated] 2026-09-29: trial form asks monthly or annual; Phil wants a text for every trial request (built, 0335, number set on Founder > Trial requests); all "Start free trial" buttons changed to "Request a trial". Phil asked whether going to a real (non-sandbox) Stripe account means rebuilding everything: no code rebuild; products copied to live mode, live keys, live webhook + secret, price ids in Vercel.

## New prices created 2026-09-30 (sandbox, by Claude via Chrome, Phil approved by popup)
Old prices left untouched. Env vars to point at these:
- STRIPE_PRICE_BUSINESS = price_1ULLo5RhL0XqZmTgyQBMgYp6 (£79/mo)
- STRIPE_PRICE_BUSINESS_YEARLY = price_1ULLoVRhL0XqZmTgHQxehQOz (£790/yr)
- STRIPE_PRICE_PRO = price_1ULLp4RhL0XqZmTgjMsfj1tf (£129/mo)
- STRIPE_PRICE_PRO_YEARLY = price_1ULLpHRhL0XqZmTgLwnHJ0UJ (£1,290/yr)
- STRIPE_PRICE_BRANCH = price_1ULLpmRhL0XqZmTgQ6YrLHyE (£25/mo, on prod_V3r1ZqVtrF0mY0)
- STRIPE_PRICE_BRANCH_YEARLY = price_1ULLpwRhL0XqZmTgoyKnyONP (£250/yr)
- STRIPE_PRICE_SEAT_YEARLY = price_1ULLqORhL0XqZmTgBGUBFHck (£50/yr, on prod_UsH1GrnazA7UsH); monthly seat £5 unchanged
All 7 set in Vercel (Production + Preview, sensitive) by Claude 2026-09-30 with Phil's popup approval; live after the next deploy. Sensitive env vars: edit value only (sending key is refused). Also switched on in the sandbox: invoice reminders (when due), Bank Transfers, successful payment receipts; finalised invoice emails were already on. All Checkout Sessions now set payment_method_types card. Stripe support email shows info@ghostautomations.co.uk (Public details).
FOUND 2026-09-30: the unactivated sandbox refuses to email an invoice to anyone but the account owner ("Activate your account to email an invoice to someone other than yourself"), so invoice emails to customers only work once Stripe is activated/live. Subscription-created draft invoices cannot be deleted, and void needs finalising first; draft in_1ULMRhRhL0XqZmTghKHdxvls (Bevan, £840, from a cancelled test sub) is stuck as a draft with automatic collection off (harmless). Test sub sub_1ULMWQRhL0XqZmTgTbaVBWWS cancelled and its invoice U6ZNESFB-0073 voided at Phil's request.
Before this the health panel showed Business £49, Pro £69, branch £7.50 as Wrong (Checkout refusing).
