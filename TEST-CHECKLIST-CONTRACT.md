# Test checklist: the contract in the app (Phase 13)

Decisions (Phil, 2026-09-29, by popup): drafts updated and approved (Diamond out, onboarding in,
annual invoiced); supplier details in one settings file and the gate stays off until they are
filled in; the Order is prefilled and the Company Admin confirms; the 90 day read only exit and the
45 day renewal reminder are part of this piece (steps 2 and 3).

## Step 1: pages, acceptance and the founder view (migrations 0346, 0347)

- A1 /terms and /dpa open signed out: Draft notice naming the details still to add, the whole
  text with clause headings, the Order table and the DPA subprocessor table; footer links Terms
  and Data processing.
- A2 Founder > Agreements: Draft, the six missing details, every company "Not asked yet", and
  "Ask to accept (test)" switches Bevan on.
- A3 Bevan's Company Admin is sent to /agreement from any page (dashboard, a record, Settings);
  the Order is prefilled (name, company number and address from Invoicing or the office).
  A Manager or carer on Bevan carries on as normal.
- A4 Refusals: no tick; a limited company with no company number; a blank address.
- A5 Accept: "Accepting…" then "Accepted", then the dashboard. The row has the Order, versions
  1.0 and 1.0, both fingerprints, the IP and is_draft true; audit agreement.accepted. Founder >
  Agreements shows "Accepted (test)" with the Order. Settings, Billing, View your agreement shows
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
