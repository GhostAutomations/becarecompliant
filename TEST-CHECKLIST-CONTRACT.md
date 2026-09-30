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
  back after the reset); retest after deploy.
- A5 Accept: "Accepting…" then "Accepted", then the dashboard. The row has the Order, versions
  1.0 and 1.0, both fingerprints, the IP and is_draft true; audit agreement.accepted. Founder >
  Agreements shows "Accepted (test)" with the Order, including Price, Included and Price List (0348). Settings, Billing, View your agreement shows
  the Order.
- A6 Safe twice: /agreement after accepting shows the record, not the form; a second submit writes
  nothing.
- A7 PASS (database, rolled back, 2026-09-29): a Company Admin can read their own acceptance and
  cannot insert, change or delete one; another company's Admin sees none; a Company Admin can no
  longer change tier, trial end, status or the agreement switch (they COULD before, by calling the
  API directly: found building this), but their ordinary settings still save; the founder and the
  server are unaffected. The first version of the guard refused every Company Admin update
  (generated name_key column); fixed by 0347 two minutes later, and no real user hit it (logs).
- A8 Founder "Stop asking" turns Bevan off again.
- A9 Phone: the accept screen on a phone (Phil).

## Text revision after Phil's second review (2026-09-30, migration 0348)

Phil ran both drafts past ChatGPT; its points were checked against the suppliers' current terms
(research 2026-09-29/30) and the revised text approved by popup. Also approved: an opt in clause
(11.8) letting a Company Admin share inspection reports, names removed, to improve templates.
Publishing waits for: the supplier details, two factor sign in for Company Admins and the founder,
retention periods by record type, the inspection report opt in switch, the written incident
procedure and the first restore test (Annex 2 promises them).

- A10 The accept screen shows Price (monthly and annual), Included and Price List; the stored
  Order has the one chosen.
- A11 /terms shows the new clauses (7.7, 8.4, 11.6, 11.8, 15.4, 19.1 to 19.4) and /dpa the
  Information Commission, the revised Annex 2 and Annex 3; the Draft notice says "subject to
  legal review".

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
