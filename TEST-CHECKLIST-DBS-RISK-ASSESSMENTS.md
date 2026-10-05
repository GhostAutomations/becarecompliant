# Test checklist: DBS risk assessments (2026-10-05)

Thistle asked for a DBS risk assessment. Agreed by popup: two forms, DBS Pending Risk Assessment and DBS Disclosure Risk Assessment, current phase, opened from the DBS card, same access as the DBS form, no certificate upload, rules follow the company's regulator.
Migration 0387 applied: both forms in the library (locked) and on Thistle, Bevan and Demo, version 1. All three companies are CIW, so the England path needs a CQC test company.

| # | Check | Result |
|---|-------|--------|
| R1 | Record page DBS card (Manager or Admin): [Complete] [Risk ▾] on the left, same height as Right to Work's Complete; card the same height as Right to Work; Risk drops down Pending and Disclosure; Supervisor and support mode see no buttons | PASS 2026-10-05 for Admin (both cards 182px, dropdown opens both forms); Supervisor and support mode not checked. Earlier layouts failed: three buttons wrapped, then a single menu was not what Phil wanted |
| R2 | Pending form, Wales company: Regulator reads "Wales (CIW)" and cannot be changed; only the Wales safeguards show; the Social Care Wales question shows | PASS 2026-10-05 (Bevan, ZZ Test Probation Starter) |
| R3 | Pending form: Adult First "Wait for the certificate" shows the must not start line; "Not requested" shows its line; the result date shows for No match and Wait only | PASS 2026-10-05 (all three Adult First answers) |
| R4 | Pending form: decision Start shows the review date; save; Evidence stores regulator ciw; the card badge reads "Review 12 Oct 26" in amber | Form and Evidence PASS 2026-10-05; badge "Review 12 Oct 26" amber PASS 2026-10-05 |
| R5 | Pending: with the review date in the past the card badge shows "Review overdue" in red | PASS 2026-10-05 (review 28/09/2026: red "Review overdue" on the card) |
| R6 | Pending: enter the DBS date of issue on the DBS form; the pending line and pill clear, normal DBS badge returns | NOT TESTED |
| R7 | Disclosure form: Barred stands down the rest, shows the stop line, saves with the assessor signature only | PASS 2026-10-05 (ZZ Test Probation Starter: stop line, rest greyed, saved with the assessor only; Evidence holds no stood down answers) |
| R8 | Disclosure form: New applicant shows the Employ decisions, Existing shows Continue decisions; "Not to work with named service users" asks which | PASS 2026-10-05 (full Disclosure saved on ZZ Audit Walk Person, every answer in the Evidence) |
| R9 | Both forms appear in Evidence history with their names; the Evidence PDF prints every answered question and the Regulator | PASS 2026-10-05 (all three PDFs open; Regulator printed; empty opening heading fix ships with 0388 push) |
| R10 | England path: on a CQC company the Pending form shows the England safeguards and named supervisor, not the Wales ones | NOT TESTED |
| R11 | A company with no regulator set: the form page says the regulator is missing and does not open the form | NOT TESTED |
| R12 | A new company created from the founder console gets both forms | NOT TESTED |

## DBS risk register column (2026-10-05)
Agreed by popup: built in for every company, after Enhanced DBS; a marker, never a date; a new certificate clears Assessed.

| # | Check | Result |
|---|-------|--------|
| C1 | People register shows "DBS risk" straight after Enhanced DBS, on Thistle, Bevan and Demo | PASS on Bevan Llanelli 2026-10-05 (Thistle and Demo use the same built in column, not looked at) |
| C2 | Someone with a Pending assessment and no certificate: amber "Pending"; red once the review date has passed | PASS 2026-10-05 (amber Pending; card red when the review is missed) |
| C3 | Certificate entered with a date of issue on or after the date applied for: cell goes blank | PASS 2026-10-05 |
| C4 | Disclosure assessment on the current certificate: "Assessed"; enter a later date of issue: blank | PASS 2026-10-05 (Assessed with date of issue 03/10/2026; blank after a new date of issue 05/10/2026) |
| C5 | Settings, People column shorthands lists "DBS risk" and a shorthand shows in the header | NOT TESTED |

## Changes from the full run (2026-10-05)
- Phil: opening section titles "The application" and "The certificate" removed (0388; Bevan Pending now v2, others edited in place as no Evidence yet). PASS on screen, both forms open with no title.
- The record banner said "the next due date scheduled" after a risk assessment; now "Evidence stored." (DBS, Right to Work, Probation: "Evidence stored and the record updated.") NOT TESTED on screen yet.
- Phil (popup): a Barred outcome shows red "Barred" in the DBS risk column. NOT TESTED on screen yet (ZZ Test Probation Starter should show it after the push).
