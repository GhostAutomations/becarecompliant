# Test checklist: the contract in the app (Phase 13)

Decisions (Phil, 2026-09-29, by popup): drafts updated and approved (Diamond out, onboarding in,
annual invoiced); supplier details in one settings file and the gate stays off until they are
filled in; the Order is prefilled and the Company Admin confirms; the 90 day read only exit and the
45 day renewal reminder are part of this piece (steps 2 and 3).

## Step 1: pages, acceptance and the founder view (migrations 0346, 0347)

- A1 PASS (2026-09-30, first version of the text): /terms and /dpa open signed out: Draft notice naming the details still to add, the whole
  text with clause headings, the Order table and the DPA subprocessor table; footer links Terms
  and Data processing.
- A2 PASS (2026-09-30, in Chrome as founder): Founder > Agreements: Draft, the six missing details, every company "Not asked yet", and
  "Ask to accept (test)" switches Bevan on.
- A3 PASS (2026-09-30): Bevan's Company Admin is sent to /agreement (checked from the dashboard, a
  record and Settings, Billing; Order prefilled with the name only, Bevan has no Invoicing details) from any page (dashboard, a record, Settings);
  the Order is prefilled (name, company number and address from Invoicing or the office).
  A Manager or carer on Bevan carries on as normal.
- A4 Refusals: no tick; a limited company with no company number; a blank address. FIRST RUN
  (2026-09-30): the server refused the missing number correctly, but the form wiped the address and
  the tick: DEF-082, fixed; retest after deploy. RETEST (2026-09-30, live fce8d2ca): no company
  number is now stopped in the browser with everything kept (PASS); a 3 letter address is refused by
  the server with "Enter your registered or main address.", name, number and address kept (PASS),
  but the TICK was cleared by React's own form reset. Fixed in accept-order-form.tsx (choices put
  back after the reset); retest after deploy. RETEST 2 (live 0807f858): Charity, number, 3 letter
  address, Annual and the tick all kept after the server refusal, error shown beside Accept. PASS.
- A5 Accept: "Accepting…" then "Accepted", then the dashboard. The row has the Order, versions
  1.0 and 1.0, both fingerprints, the IP and is_draft true; audit agreement.accepted. Founder >
  Agreements shows "Accepted (test)" with the Order, including Price, Included and Price List (0348). Settings, Billing, View your agreement shows
  the Order.
  FIRST RUN (2026-09-30, live 0807f858): "Accepting…" shown; row saved correctly (versions 1.0/1.0,
  both fingerprints, Order incl. Price, Included, Price List, IP, user agent, is_draft true) and audit
  agreement.accepted written. BUT the Admin stayed on /agreement (the record) instead of the dashboard:
  revalidatePath re-rendered the page without the form, so the client redirect never ran. Fixed:
  the action now redirects on the server. Retest after deploy (delete the test row by id first).
  RETEST (live 1977ae6d, test row 3bfb6c01 deleted by id first): "Accepting…" then straight to the
  dashboard ("Welcome, Bev"). Row 40644e00 correct. PASS.
- A6 Safe twice: /agreement after accepting shows the record, not the form; a second submit writes
  nothing.
  PASS (2026-09-30): two tabs open on the accept screen, the second with different details and
  Annual; accepted in the first, then the second. The second went to the dashboard and wrote nothing:
  one row, the first tab's details, one new audit entry. /agreement afterwards shows the record.
- A7 PASS (database, rolled back, 2026-09-29): a Company Admin can read their own acceptance and
  cannot insert, change or delete one; another company's Admin sees none; a Company Admin can no
  longer change tier, trial end, status or the agreement switch (they COULD before, by calling the
  API directly: found building this), but their ordinary settings still save; the founder and the
  server are unaffected. The first version of the guard refused every Company Admin update
  (generated name_key column); fixed by 0347 two minutes later, and no real user hit it (logs).
- A8 Founder "Stop asking" turns Bevan off again.
  PASS (2026-09-30, in Chrome as founder): Agreements showed Bevan "Accepted (test)" with the full
  Order under Every acceptance (Price, Included, Price List, IP, versions, fingerprints), which
  completes A5. Stop asking: button flashed and returned as "Ask to accept (test)", agreement_required
  false, audit agreement.test_switched_off. The draft acceptance stays as a record.
- A9 Phone: the accept screen on a phone (Phil).
  PASS (2026-09-30, Phil on iPhone): accepted as Bev Admin, row 320f7937 (iPhone user agent). Phil's
  note: a Black account was asked Monthly or Annual though it is never billed (Black is only ever
  switched on by the founder, never offered at sign up). Fixed (0349 + fill.ts billingApplies): a
  Black account is not asked, the server records "none" from the plan whatever the form sends, and
  the Order shows "Not applicable (Black account)". Retest after deploy.

## Text revision after Phil's second review (2026-09-30, migration 0348)

Phil ran both drafts past ChatGPT; its points were checked against the suppliers' current terms
(research 2026-09-29/30) and the revised text approved by popup. Also approved: an opt in clause
(11.8) letting a Company Admin share inspection reports, names removed, to improve templates.
Publishing waits for: the supplier details, two factor sign in for Company Admins and the founder,
retention periods by record type, the inspection report opt in switch, the written incident
procedure and the first restore test (Annex 2 promises them).

- A10 The accept screen shows Price (monthly and annual), Included and Price List; the stored
  Order has the one chosen.
  PARTLY (2026-09-30): Bevan is Black, so it shows "No charge (Black account)", Included and Price
  List, and the stored Order matches. The Monthly and Annual price lines need a Business or Pro
  company's Admin to see on screen.
  Phil (popup, 2026-09-30): the unit tests are enough (Business and Pro, Monthly and Annual, all
  covered by orderPriceText); a real Business or Pro Order is checked when the first paying
  customer accepts. A10 PASS.
- A11 /terms shows the new clauses (7.7, 8.4, 11.6, 11.8, 15.4, 19.1 to 19.4) and /dpa the
  Information Commission, the revised Annex 2 and Annex 3; the Draft notice says "subject to
  legal review".
  PASS (2026-09-30, live): every listed clause present on /terms; /dpa has the Information
  Commission, the two kinds of backup (Annex 2), our own nightly file copies (Annex 3), the
  inspection themes (Annex 1) and 11.3; no dashes; Draft notice lists what is still to add.

## Third review (2026-09-30)

Phil's second pass through ChatGPT. Applied: 16.2 wording; 7.7 covers 19.3; 8.4 old price until 60
days after a late notice; 14 caps not added together, the data protection cap is the ceiling for a
contract year; 15.4 prepaid fees credited for a security pause; one credit per text however long,
failed sends free; retention period and starting event per record type; 11.8 anonymous themes
only, as processor on the customer's instruction; DPA breach contact, notifying individuals, 5
Working Days, urgent audits, "designed to prevent", advisory monitoring, honest supplier deletion,
Supabase backups possibly overseas, file backups stated. Drafts unnumbered ("Draft, subject to
legal review"); the first published text is 1.0.

- A12 /terms and /dpa head reads "Version 1.0, draft, subject to legal review" (matching the
  Order's "Versions accepted"); 8.4 no longer raises an annual price mid term.
  PASS (2026-09-30, live): both heads read "Version 1.0, draft, subject to legal review"; 8.4 keeps
  the existing price for the next annual term; 14.4 and 17.4 fifth review wording present.

## Order first, agreement fills in (2026-09-30)

Phil, testing the Pro Order on his phone: the Order should come before the agreements and fill them
in; choosing Monthly or Annual changed nothing in the agreement and its Start date read [ ]. Agreed by
popup: the Order at the top, then both agreements, then the tick and Accept; the Order table at the end
of the Subscription Agreement fills in live (fillOrderTable); Your agreement shows it filled from the
stored Order. The fingerprint stays on the standard wording, the Order is stored beside it.
Bevan switched to Pro by SQL for this (no Stripe subscription, so nothing billed); back to Black after.

- A13 Pro: Price and the agreement's Order row change when Monthly and Annual are switched (£129 a
  month; £1,290 a year); Included 6 users, 2 branches, 50 AI, 100 texts; Start date today; typed
  name, number and address appear in the agreement's Order as typed. Accept, then Your agreement shows
  the agreement with the Order filled in.
- A14 Business: the same at £79 a month, £790 a year; 4 users, 1 branch, 25 AI, no text messages.
- A15 Black: no Monthly or Annual; the agreement's Order reads Billing option "Not applicable (Black
  account)" and the stored row says none.
  A13 PASS (2026-09-30, Phil on phone, Pro, Annual). Phil's notes, both agreed by popup and built:
  "Price List" with a bare date confused (now "Extras": £5 a month per extra user, £25 a month per
  extra branch, plus VAT; the agreement's Order adds "(prices from 29 September 2026)" and that whole
  line is stored), and after Accept the next screen should be payment, not the banner above Welcome
  (new /agreement/payment, step 4).
- A16 Payment step: accepting as a paying plan with no live subscription goes to "Payment, Step 4 of
  4". Annual: amount, onboarding fee, extras, "We will email your first year's invoice to ...
  payable within 14 days", Continue goes to the dashboard. Monthly: Add a card opens Stripe
  Checkout (do NOT complete it on Bevan); "Not yet, I'm in my free trial" shows only while a trial
  runs. Black, or a company already paying, goes straight to the dashboard. Another role opening
  /agreement/payment is sent to the dashboard.
  A16 Annual PASS (2026-09-30, Phil on phone, Pro). Phil: the Order should ask how many branches and
  show the office team and branches included. Agreed by popup: as priced (Business office team + 1
  branch, Pro office team + 2), and ask "How many branches do you need?" starting at the number
  included, showing any extra at £25 a month each; stored (0350 branches_ordered, branches_text),
  shown in the agreement's Order (new Branches row), Your agreement, Payment and Founder > Agreements.
  Billing still follows the branches actually set up.
- A17 Branches: Pro shows "Your plan includes the office team and 2 branches", Branches "2 branches,
  included in your plan"; change to 4: "4 branches: 2 included, plus 2 extra at £25 a month each
  (£50 a month plus VAT)" on screen and in the agreement's Order. 0 or 51 is refused. Accept: the
  row has branches_ordered 4 and that line; Payment and Founder > Agreements show it. Black: not asked.
- A16 Monthly still to run: Add a card opens Stripe Checkout (do not pay); no skip link on Bevan
  (no trial).
  A17 superseded (2026-09-30): Phil asked instead for "Your plan includes X. How many extra ... ?"
  for users AND branches, the charge in white underneath, the plan as bullet points, and a breakdown
  like an invoice with the total; no bold. Annual: the Admin chooses extras yearly with the plan
  (ten months' price for twelve) or monthly by card (full price). Totals read plus VAT. Built with
  0351 (extra_users, extra_branches, extra_users_text, extras_billing, extras_paid_text,
  total_text); the agreement's Order gains Extra users, Extra branches, Extras paid and Total rows.
- A18 Order extras and breakdown (Pro): bullets for the plan; "Your plan includes 6 users. How many
  extra users do you need?" 0 gives "Nothing extra."; 2 gives "You will be charged an extra £10.00 a
  month (2 x £5.00)". Branches the same at £25. Monthly with 1 extra branch: "Your monthly cost" Pro
  plan £129.00, 1 extra branch x £25.00 £25.00, Total each month, plus VAT £154.00. Annual with
  extras: the "How would you like to pay for the extras?" choice appears; Yearly shows one yearly
  total with extras x 10 months; Monthly by card shows the plan a year and a separate monthly total.
  The agreement's Order and, after Accept, Payment, Your agreement and Founder > Agreements show the
  same lines. Nothing in the section is bold.
  A18 PASS (2026-09-30, Phil on phone, Pro).
- A14 Business: screens PASS (Business bullets, 4 users, office team and 1 branch, £79 plan, 1 extra
  user £5, yearly extras x 10). Phil accepted on Annual with extras monthly by card, so the payment
  step showed the invoice message and Continue (as built); Stripe was not opened. Phil then asked
  why Annual is not billed through Stripe: decided (popup) Annual pays by CARD through Stripe by
  default, with "get an invoice instead" for bank transfer; built with the invoicing piece.
  "Add a card" on the payment step (Monthly) is retested there.
- A15 Black PASS (2026-09-30, Phil on phone): no billing or extras questions, "No charge (Black
  account)", Order rows Not applicable, straight to the dashboard. Bevan back on Black.

## Invoicing through Stripe (2026-09-30, 0352)

- I1 Founder > Platform health lists the four yearly prices; each reads Matches once set up. PASS 2026-09-30 (checked by Claude after deploy 98ed248: all nine prices Matches, "Stripe agrees").
- I2 PASS 2026-09-30 (Bevan, Business Monthly: payment step £79.00 a month plus VAT; Stripe page Business £79.00 per month, card only; Phil confirmed, not paid).
- I2 Monthly, card: accept on Monthly, Add a card opens Stripe with the plan (and any extras) and, when
  due, "Onboarding"; pay with a TEST card only if Stripe is in test mode. Subscription appears with
  billing_interval month.
- I3 FAIL 2026-09-30, DEF-083: ordered 1 extra user yearly, accepted £840.00 a year, Stripe showed Business £790.00 per year only. Fixed (charge what they ordered). RETEST PASS 2026-09-30 after deploy e1a8506: Stripe showed Business £790.00 per year and Extra Seat £50.00 per year, £840.00, card only (Phil confirmed, not paid).
- I3 Annual, card: accept on Annual (extras yearly), Add a card shows the yearly price (£790 or
  £1,290). Annual with monthly extras: Stripe shows the year only; after paying, the monthly extra
  lines appear on the same subscription.
- I4 FAIL 2026-09-30, DEF-084: subscription created right in Stripe (send invoice, 14 days, card + bank transfer, £790 + £50) but the Admin landed on the dashboard with no Sent message or link, and the first invoice stayed a draft. Fixed. RETEST PASS 2026-09-30 after deploy 46c609f (run by Claude on Bevan with Phil's go ahead): first test subscription cancelled in Stripe, fresh Annual acceptance (charge line now reads £50.00 a year), Get an invoice instead landed on Invoice sent: £840.00 to ppdavies+cob@gmail.com, payable by 14 October 2026, View and pay (invoice.stripe.com) and PDF links; Stripe shows invoice U6ZNESFB-0073 Open, £840.00, due 14 Oct; going back to the payment step now goes to the dashboard, so it cannot be pressed twice.
- I4 Annual, invoice: "Get an invoice instead" says "Sending…" then "Sent" with "View and pay the
  invoice"; the invoice is payable in 14 days by card or bank transfer; pressing twice makes one
  subscription.
- I5 PASS 2026-09-30: Phil paid one £10 AI top up on Bevan with Stripe's test card (sandbox). Stripe page card only; back on Settings, Billing; ledger +100 AI credits (topup, cs_test_a1qFO1…); Stripe invoice U6ZNESFB-0074 £10.00 Paid, Bevan Care Ltd.
- I5 Top up: buying AI credits produces a Stripe invoice as well as the receipt.
- I6 PASS 2026-09-30 after deploy ba497c3 (DEF-085 fixed first): Unpaid showed Bevan £840.00 Due 14 Oct, Paid showed the £10 top up, no other products' customers, View and PDF opened Stripe's pages (Phil).
- I6 Founder > Invoices: Unpaid shows the Annual invoice as Due; Paid shows paid ones; View and PDF
  open Stripe's pages; empty filters say so.
- I7 FAIL 2026-09-30, DEF-086: yearly cost shown inside the Seats card; Move to Pro and the notes still monthly. Fixed. RETEST PASS 2026-09-30 after deploy cf96a6f (Phil): plan card shows the yearly cost like an invoice (£790 + £50 x 10 months = £840 plus VAT), Seats shows usage only, Move to Pro compares yearly totals, Branches gives the yearly price. £1290.00 missing its comma: formatPence now thousands separated (next push).
- I7 Settings, Billing on an Annual company shows /yr amounts.
