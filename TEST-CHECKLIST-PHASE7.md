# Phase 7 test checklist — Billing & tiers

## RESULTS LOG (2026-07-12, driven in Chrome + DB, Thistle Enterprise, Stripe test mode)
- A1 config render: PASS (billing page shows plan, seats, cost; no "not configured").
- B1 checkout opens: PASS (Stripe Checkout Sandbox, "Subscribe to Be Care Compliant Enterprise £199.00 per month").
- B2/B3 subscribe activates: PASS (test card 4242; company_billing = customer cus_UsHK…, sub sub_1TsX…, status active, billed_tier enterprise, seat_quantity 0, period end 12 Aug 2026).
- B4 audit: PASS (checkout.session.completed + customer.subscription.created + invoice.paid all stripe_events status=processed, no errors).
- Billing page active state: PASS (shows Active, next payment 12 Aug 2026, Manage billing).
- D1/D2/D3 portal: PASS (Stripe portal test mode; correct customer Thistle Care Wales / ppdavies@gmail.com; invoice 13 Jul £199.00 Paid; Cancel option present).
- Gotcha found + fixed during test: STRIPE_PRICE_* were set to product NAMES not price_ IDs ("No such price: 'Be Care Compliant Enterprise'"); corrected to price_ IDs + redeploy. Code surfaced the error visibly (no silent failure), as designed.
- C1/C2 seat increase: PASS (Thistle 3 -> 4 -> 5 active via two accepted invites; seat_quantity 0 -> 1; two customer.subscription.updated events processed; £5 seat line added on Stripe).
- C3 seat decrease: PASS (disable a 5th user -> active 5->4, seat_quantity 1->0, customer.subscription.updated processed). Hook added to setUserStatus + deleteUser after C1 revealed only the accept path was wired (deployed commit 75a7112).
- Delete path seat sync: PASS (deleted a test user -> deleteUser ran syncSeatQuantity; active 4->3, seat_quantity 0).
- Live Users/invites list (0057, Additions pulled into Phase 7): DEPLOYED; eyeball the pending/team list updating with no refresh on accept/disable/delete.
- A3 form-builder gating: PASS (tested by temporarily flipping Thistle tier, reverted to enterprise). Business shows the "available on Pro and above" upgrade card; Pro/Enterprise show the builder.
- F1 Black display: PASS ("Everything included, with nothing to pay", no billing buttons).
- F2 Diamond display: PASS ("usage only", this-month SMS/AI usage, Manage billing).
- Business/Pro billing display: PASS (£49 / builder-unlocked at Pro).
- D4 cancel subscription: PASS (portal Cancel -> customer.subscription.deleted processed -> company_billing.subscription_status=canceled; cancel modal confirmed BOTH Stripe line items present incl. the £5 Extra Seat, proving the seat item is attached). Thistle left cancelled in TEST mode; re-subscribe via the Subscribe button anytime.
- CANNOT be tested from this environment (need Stripe CLI / test clock / second device); log to Final Testing:
  - E1 webhook bad signature -> 400: run `stripe listen`/`stripe trigger` with a wrong secret, or POST a tampered body. Code path: constructEvent throws -> 400 (verified by reading).
  - E2 webhook fail-closed 503 when STRIPE_WEBHOOK_SECRET missing: code-verified (route returns 503 before verifying); cannot unset the live secret without breaking the endpoint.
  - E4 invoice.payment_failed -> past_due: use a Stripe test clock or CLI `stripe trigger invoice.payment_failed` against a real subscription; expect subscription_status past_due + audit billing.payment_failed.
  - F3/F4 Diamond usage cron: needs a Diamond company with prior-month usage_events and a Bearer CRON_SECRET call to /api/cron/stripe-usage; verify one invoice item per kind + billing_usage_runs idempotency. Also confirm the Diamond per-unit rate decision first.
  - A4 AI gating live + SMS gating live: same requireFeature pattern as A3 (verified); AI needs a policy uploaded to click, SMS needs Twilio (already in Final Testing).
  - G1 single-session cross-device: code-verified (login claims session; requireUser signs stale sessions out to /login?reason=signed-out-elsewhere). Eyeball on a second device.



Run as popups, one at a time, Pass / Fail / Not tested. Anything Not tested is
logged into Final Testing. Use Stripe TEST mode end to end (sk_test_ + a test
webhook secret) before any live key is discussed. Do not test until the code is
deployed AND migration 0056 is applied (both confirmed).

Prerequisite setup (Stripe test mode): products + prices created, price IDs and
STRIPE_SECRET_KEY (test) in Vercel, deploy done, webhook endpoint created with
its signing secret in STRIPE_WEBHOOK_SECRET, deploy done again.

## A. Configuration and gating (no card needed)
- A1. With no STRIPE_SECRET_KEY set, /settings/billing shows the "billing is
      being set up" notice and no 500; plan + seat cost still render.
- A2. Founder console shows each company's tier, a billing status pill, monthly
      figure for subscription tiers, and "usage only" / "free, founder granted"
      for Diamond / Black. Committed MRR total renders.
- A3. Form builder (/settings/forms) on a Business company shows the upgrade
      card, not the builder; on Pro/Enterprise it shows the builder. (No
      Business company exists yet, so create one or set a test company's tier.)
- A4. AI policy suggestion (Settings > Absence) on a non-Enterprise company
      returns the "available on the Enterprise tier and above" message; on
      Enterprise it proceeds.

## B. Subscribe (Stripe Checkout, test cards)
- B1. On a Business/Pro/Enterprise company with no subscription, /settings/billing
      shows Subscribe; clicking opens Stripe Checkout with the correct base price
      and (only if >4 users) the extra-seat line.
- B2. Complete Checkout with test card 4242 4242 4242 4242. On return, the page
      shows the subscription Active, next payment date, and Manage billing.
- B3. company_billing has stripe_customer_id, stripe_subscription_id,
      subscription_status = active, billed_tier, current_period_end. A
      stripe_events row for checkout.session.completed is status = processed.
- B4. audit_log has billing.checkout_started and billing.subscription_activated.

## C. Exact seat metering (the fixed rule)
- C1. With 4 active users, the subscription has NO seat line (or quantity 0) and
      the invoice base only. Adding a 5th active user (accept an invite) syncs a
      seat line quantity 1 in Stripe; company_billing.seat_quantity = 1.
- C2. Adding a 6th user makes quantity 2; the Billing page total = base + 2×£5.
- C3. Removing a user (disable/leaver) drops the quantity back; billing stops for
      that seat. Proration credit appears on the next invoice (create_prorations).
- C4. Seat sync is idempotent: re-accepting / re-running does not double the
      quantity.

## D. Customer portal
- D1. Manage billing opens the Stripe Customer Portal for the right customer.
- D2. Updating the card in the portal succeeds; returning lands on /settings/billing.
- D3. Viewing invoices in the portal shows the subscription invoice(s).
- D4. Cancelling in the portal fires customer.subscription.updated/deleted;
      company_billing.subscription_status and cancel_at_period_end update; the
      Billing page reflects it.

## E. Webhook robustness
- E1. A webhook with a bad/missing signature is rejected 400 (test via Stripe CLI
      `stripe trigger` with a wrong secret, or resend with a tampered body).
- E2. With STRIPE_WEBHOOK_SECRET unset in production, POST /api/webhooks/stripe
      returns 503 (fails closed).
- E3. Replaying the same event id (Stripe dashboard "Resend") does not double
      apply; the second is skipped (stripe_events row already processed).
- E4. invoice.payment_failed sets subscription_status past_due; the Billing page
      shows "Payment due" and prompts to fix the card. audit billing.payment_failed.

## F. Diamond and Black
- F1. A Black company: /settings/billing shows "nothing to pay", no Subscribe/
      Portal; no Stripe customer/subscription is created.
- F2. A Diamond company: shows "usage only", this month's SMS/AI usage, and (if a
      customer exists) Manage billing. No subscription.
- F3. Diamond usage cron (/api/cron/stripe-usage, manual trigger with CRON_SECRET
      bearer) for a closed month with usage creates one Stripe invoice item per
      kind and one invoice; billing_usage_runs has a row per company/month/kind.
- F4. Re-running the cron for the same month does not double bill (23505 skip).
  NOTE: Diamond per-unit customer rate is an OPEN decision (env
  STRIPE_DIAMOND_SMS_PENCE / STRIPE_DIAMOND_AI_PENCE). Confirm the rate with Phil
  before the first LIVE Diamond invoice. Until set, the cron bills the metered
  cost_pence pass-through.

## G. Single-session (verified present, re-confirm live)
- G1. Signing in on a second device signs the first out; the first device, on its
      next action, lands on /login with "You've been signed out because your
      account was signed in elsewhere."

## Cold / deferred (log to Final Testing)
- Reporting/exports tier gating: the reporting_exports feature is Pro+ but the
  export screens land in Phase 8; wire and test the gate there.
- No Business/Pro/Diamond/Black company exists yet (only Thistle = Enterprise),
  so A3, A4, C*, F* need test companies created at those tiers.
- Live (non-test) Stripe keys: switch and re-run B–F once the test loop passes
  and prices are confirmed final.
