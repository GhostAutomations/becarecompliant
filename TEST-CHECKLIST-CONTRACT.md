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
- I8 PART PASS 2026-09-30 (Phil, phone screenshots): switch shows No, Mark as a test company turns it to Yes. Then PASS (Phil): Founder > Invoices shows none of Bevan's invoices, Revenue leaves Bevan out. I8 PASS. The screenshots showed DEF-087 (founder page monthly on Annual), fixed.
- I8 Test company (0353): on Founder > Companies > Bevan, Billing card, press "Mark as a test company";
  the pill reads Yes. Founder > Invoices (All) then shows none of Bevan's invoices (draft, void, £10
  paid). Revenue and the console MRR leave Bevan out. Pressing "Not a test company" brings them back.

## Deal setup and the branch word (2026-09-30, 0354 and 0355)

Test on a NEW test company made for the purpose (not Thistle). Stripe in sandbox; never pay.

- D1 New company form: Deal section. Word House / Houses, two more houses (Treehouse, Oak House),
  tier Business, Annual, extras yearly, 1 extra user, 7 extra houses, extra house price two step:
  first 3 at £25, then £10. Onboarding waived. Create. The company page shows the Deal as saved,
  Branches "(they say Houses)", and three houses plus the office.
- D1 PASS 2026-09-30 (Phil, House Test Ltd) after DEF-090 (create refused: null uses_office_address) and DEF-091 (refused form emptied) were fixed. DEF-092 found: Add a branch said per month for an Annual deal before subscribing; fixed, next push.
- D2 part 1 (2026-09-30): a word with no plural was ACCEPTED, as built (plural filled in as word + s); the test step was wrong. Phil chose a smarter guess: pluralOf (s, es, ies rules, 1 test) fills the plural box as soon as the word is typed, visible and changeable (next push). Refuse Test Ltd was created by this step and needs deleting.
- D2 PASS 2026-09-30 (run by Claude in Chrome at Phil's request, on one form): a deal on Black refused ("A Black account is free, so it has no deal..."); two branches named Main and main refused ("Two branches have the same name..."); a second price with no count refused ("Say how many extra branches are at the first price"). Every field kept after each refusal (DEF-091 fix proven). Nothing created (checked in the database).
- D2 Validation: word without plural, a deal on Black, a duplicate house name, "first how many"
  empty with a second price set: each refused with a plain message, nothing created.
- D3 Founder edits the deal before acceptance (change the first price to £20): saved, audit
  entry deal.saved. After acceptance the same edit is refused ("Branch word saved. The deal was
  not changed"), the word can still change.
- D3 part 1 PASS 2026-09-30 (Claude in Chrome): House Test Ltd deal, first price 25 to 20, Save deal: company_deals 2000, audit deal.saved with the new deal, founder page reloads showing 20 and "£20.00 ... first 3 extra, then £10.00". Note: the founder page still says per month until DEF-092 is pushed. Part 2 (refused after acceptance) waits on D4, which needs the House Test Admin to sign in.
- D4 Admin signs in: Order shows "as agreed with you" for plan, billing and extras, no choices to
  change; the Order table reads "Extra houses" and has the row "Your word for a branch: House";
  the cost lines show 3 houses at £25 and 4 at £10 (x 10 months on Annual); onboarding not charged.
- D5 Payment step: "Extra houses" label; Stripe Checkout shows the plan, Extra Seat and a line
  named "Extra house" at the agreed price (graduated). Do not pay.
- D6 Settings, Billing: plan card shows the agreed prices, two house lines for the two step price,
  the Houses card and notes say house or houses, not branch. Move to Pro hidden when the deal set
  a plan price, otherwise uses the agreed extra prices.
- D7 Branch word across the app for the Admin: sidebar and Settings tile say Houses; People and
  Service User register filters say "All houses"; create person and service user forms say
  "House *"; Incidents, Complaints, Whistleblowing, Holidays, Absence, Training, Planner, On Call
  filters and columns say House; Reports chooser and Regulation 73/80 lists say house; a
  PDF and CSV report say House in the column and "All houses" for the scope; an Evidence PDF
  says House. The top bar pill for a manager reads "House Manager".
- D3 part 2 PASS 2026-10-01 (Claude in Chrome as founder, after the House Test acceptance): first price 20 to 18, Save deal: "Branch word saved. The deal was not changed: their Admin has already accepted the agreement with it, and the Order they accepted is the contract." company_deals still 2000. D3 PASS.
- D4 PASS 2026-10-01 (Claude in Chrome as the House Test Admin, after Phil switched on "Ask to accept (test)"): Order fixed "as agreed with you", houses throughout, the row "Your word for a branch: House", cost lines £790 + £50 + 3 x £20 x 10 + 4 x £10 x 10 = £1,840.00 a year, onboarding waived, "(prices agreed with you)". Draft test acceptance recorded with Phil's OK (legal name House Test Ltd, company number 00000000, address 1 Test Street, Cardiff).
- D5 PASS 2026-10-01: payment step "Extra houses 7: the first 3 at £20.00 ... and 4 at £10.00", total £1,840.00; Stripe Checkout (sandbox, card only) Business £790.00, Extra Seat £50.00, "Extra house" Qty 7 £1,000.00, £1,840.00 per year. Not paid.
- D6 PASS 2026-10-01: Settings, Billing yearly like an invoice with the two house lines, Seats and Houses cards in houses, Move to Pro £1,840 against £2,190 a year. Found and fixed "2 housesinstead" (missing space), and the same JSX space trap in two more places (next push).
- D7 PART PASS 2026-10-01: Settings (Manage your company, houses and team; Houses tile), People register filter "All houses", Add a person "House *" and "Auto filled from the house", Reports chooser in houses. Dashboard banner said "2 more branches": fixed (next push). Still to see: role pill "House Manager" (needs a manager login), a report PDF/CSV and an Evidence PDF with a house.
- D8 A company without a word (Bevan) still says Branch everywhere, and Founder always says
  branch, with the company's word alongside on its page.
- D9 Word changed after a live subscription: the nightly or next sync moves the old branch line
  to the new "Extra <word>" price in place (no second line on the subscription).

## Demo accounts (2026-09-30, 0356 to 0358)

Database parts proven by Claude in a rolled back dry run on 2026-09-30: sample data (50 people,
40 service users, 420 checks: 264 green, 58 amber, 49 red, 49 unscheduled; 366 evidence), 5 AI
credits per login then refused, refund gives one back, active time capped by real time, survey
answers once (a 9 out of 5 refused), invites refused inside a demo. Still to test live after deploy:

- DM1 Founder > Demos: set up a demo for a test client (your own +demo address, a password, blank
  days). Lands on the demo page with "The demo is ready"; Founder > Companies does not list it.
  PART PASS 1 Oct: demo built (3 branches, 50 people, 40 service users, 420 checks, ends 8 Oct), not
  in Founder > Companies. The first login was refused (DEF-093, leaked password); added again by
  Add another login, now a Company Admin with 5 AI credits. Retest of the refusal message after deploy.
  PASS 1 Oct (Test Client 2, after deploy): "The demo is ready" banner with the login email.
- DM2 Sign in as the demo login (another browser): straight to the dashboard, no agreement; gold
  "Demo account" bar with the end date and "AI: 5 of 5 left"; three branches, about 50 people and
  40 service users, a green, amber and red mix; evidence opens as a PDF.
- DM3 Settings has no Billing, Seats or Roles, users and access; /settings/users and
  /settings/billing go back to Settings; adding a Person with an email makes no login.
- DM4 Use an AI button 6 times: the bar counts down, the 6th says out of credits.
- DM5 (part seen 1 Oct: 1 sign in, 2 min, parts used shown) Founder demo page after a few minutes of use: times signed in, total time, average visit,
  parts used most (idle tab adds nothing).
- DM6 Extend by 1 day, then End now: the demo login lands on "Your demo has ended" with "Tell us
  what you thought". Answer the survey: all seven scores needed; answers show on the founder page.
- DM7 Survey from 2 days before the end: the bar shows "Tell us what you thought".
- DM8 The morning run (07:00 London) after the end: one survey email with a button, to a login that
  has not answered, and never twice.
- DM9 Delete now (type DELETE): company and login gone, usage and feedback still on the demo page.
  PASS 1 Oct (Claude in Chrome, Test Client): page says Deleted, usage kept (1 sign in, 2 min, Dashboard
  68%, Service Users 32%); database: company, people, evidence, sign in account and profile all gone.
- DM10 Trial requests: "Set up a demo for <name>" opens Demos with the details filled in.
- DM11 (new) Try the AI: the demo bar and the dashboard AI tile open Try the AI, with seven AI features,
  each opening a sample record that is ready for it; the credits left are right.
- DM12 (new) Sample data: dashboard about 85% in date with 4 overdue, CIW readiness mostly on track,
  PQS mostly green, Planner shows this week, policies and training up to date figures, on call shows two
  open follow ups, recent activity filled, 2 Return to Works waiting, no billing banner, SMS Off.
- DM13 (new) A refused password (one on the leaked lists) is explained in plain English and nothing is built.
- DM14 (new) Login email: on Test Client 2, Send login email (password typed again) sends one branded
  email with a Log in button, email, password, end date and five things to try; the password typed
  works. The Set up and Add another login tick boxes send the same email when saved.
  PART PASS 1 Oct: sent and delivered (Resend, 11:48), branded, details and five tips right, reply to
  hello@. Only a brief "Sent" flash showed, so the result line now stays (showOk). Log in with the emailed
  password: PASS (Phil signed in). Still to check: the tick box on Set up.

## Invitation links (DEF-088, DEF-089)

- IV1 Open an old or used invitation link: "That invitation link has expired or has already been
  used", Send me a new link sends a fresh invitation (not a reset) to a login still waiting.
- IV2 Settings, Roles users and access, a login still waiting: "Invited, not accepted yet" and
  "Resend invite", no "Enable this login".

## Social Care Wales registration number (DEF-097, 1 Oct 2026)
- SC1 Thistle Training matrix: SCW number column next to Carer shows the 12 numbers; Damilola shows Not yet (now Under 6 months).
  PASS 1 Oct (Claude in Chrome, read only): all 12 W/ numbers shown, Damilola Not yet.
- SC2 Click a number on the matrix (on a test company, not Thistle), change it, Save: it updates in place and on the person's record.
  PASS 1 Oct (Claude in Chrome, Bevan, ZZ TEST Carer Two): popup opens; 12<3 refused with a clear message and kept in the box; W/1234567 saved, matrix and record show it, audit says Set the Social Care Wales registration number; blank saved puts Missing back.
- SC3 Person record: the number shows under the name; Manage record has the field and saving keeps it.
  PART PASS 1 Oct: Asim Riaz shows "Social Care Wales registration: W/5168234". Manage record (ZZ TEST Senior, under 6 months): W/7654321 saved, record line and matrix show it, all other fields unchanged in the database. A refused save reset the form (DEF-098). RETEST PASS after deploy: BAD<1 refused with the / message, the typed number and a changed mobile both kept on screen, database unchanged.
- SC4 Add person has the field; a CQC company shows none of this.
  PASS 1 Oct (Bevan): Add person has the field; BAD<2 refused and every field kept (name, branch, job title, start date, manager, email, mobile, the hold tick); W/9990001 saved, one record made (ZZ TEST SCW New Starter, 9 checks), the record shows the number, no invite made. CQC half PASS 1 Oct (Bevan switched to CQC for the check, then back to CIW): no SCW column on the matrix, no line on the record, no field on Manage record or Add person, and saving Manage record kept the stored number (W/9990001). Back on CIW the column returned.

## Social Care Wales renewal date (0361, 1 Oct 2026)
- SR1 Matrix popup on Bevan has Renewal date; save one 200 days away: green chip under the number; 60 days away: amber; yesterday: red. Hover says the renewal date and, when amber, the last day to send it (21 days before).
- SR2 A renewal date with no number is refused ("Add the registration number as well").
- SR3 Person record line: "renews ..." (amber or green), or "renewal date passed ..., so the registration has ended" in red, or "no renewal date recorded".
- SR4 Manage record and Add person have the date; saving Manage record keeps it.
- SR5 PQS SCW registration: a person whose renewal date has passed no longer counts as registered.
- SR6 Daily People report: a renewal whose send by date (renewal minus 21 days) is within 14 days or past appears as "Social Care Wales renewal: last day to send it".
