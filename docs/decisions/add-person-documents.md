# DBS and Right to Work on Add a person

> Add a person asks for DBS and Right to Work, using the company's own DBS and Right to Work forms
> (the ones behind Complete on the record's cards) and saving them through the same code, Evidence
> and audit. Phil, 2026-10-15. Migration 0485. Read before touching Add a person, the "They already
> work here" panel or the DBS and Right to Work forms.

## The rules

- [stated] DBS is mandatory, one or the other: the DBS form filled in (date of issue required; the
  Enhanced DBS follows it, as on the record), or the tick "No DBS yet, a risk assessment will be
  needed". Not both: ticking clears and hides the details. Neither is refused with plain words and
  nothing typed is lost. The risk assessment form is not offered on this page.
- [stated] Right to Work is mandatory (popup): the Right to Work form, whose Date of check and Basis
  are required; "Settled status or British or Irish" asks for no expiry date.
- [stated] Saved exactly as completing the forms on the record: lib/people/actions.ts fileTrackerForm,
  lifted out of completeTrackerForm and called by both (same Evidence, same tracker dates, same audit
  "person.tracker_form_completed"). Checked before the person is made, so a refusal saves nothing;
  a form that fails to file after the person exists is said plainly, as the history is.
- [stated] "No DBS yet": once added, the person who added them and the line manager chosen on the form
  (once each; a line manager without an email is left out) are emailed "DBS Pending Risk Assessment
  needed" with a branded button that opens that assessment for that person. Nothing else about them is
  in the email. Awaited inside the save; once each (notification_log dedupe key
  dbs_pending_risk_assessment:<person>:<recipient>). If it does not go, the person is still added and
  the record says so and what to do. The DBS card is then red from the start date as for any missing
  DBS, and lib/people/dbs-pending.ts takes over once the assessment is done.
- [stated] The email goes for test companies too (popup), like the completed emails; it only ever goes
  to staff logins. It needs RESEND_API_KEY and RESEND_FROM.
- [stated] "They already work here" (popup): the DBS date of issue, Enhanced DBS, RTW Expiry and RTW
  Limits boxes are gone from the panel, and the save never reads them; one place each. The panel keeps
  the probation boxes and every history box.
- [stated] Support mode (popup): Evidence is never signed in support mode (DEF-006), so there the two
  sections are a note; the Founder can still add the person and both cards are red until someone at
  the company completes them.
- [stated] One form, one person (popup, 0485): the form carries a token made when it opens; a double
  click or a resubmit opens the person the first press made. No second person, Evidence or email.
- Speed: the two forms load in the page's existing parallel batch in one read
  (getCompanyFormsByKeys); the save's look ups before the insert are one batch.
- Not changed: the CSV import (lib/import/commit.ts) and the demo seed, the other ways a person is
  added; the record's DBS and Right to Work cards and forms; RLS.
