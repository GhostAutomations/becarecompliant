# Phase 4 — Service Users, test checklist

Run once the code is deployed (Vercel green) and migrations 0027 + 0028 are applied
to the becarecompliant project (ref bgrtcvyjuwopunpnudeu). Run as a popup checklist,
one check at a time, Pass / Fail / Not tested. Anything Not tested is logged into
Final Testing.

## Register + views
1. /service-users shows the register with columns in order: Service User, Package Start Date, SSID, Status, Most Recent Review, New Review Due, Planned Review Date, Review Status.
2. The Service User column is sticky on horizontal scroll; the permanent horizontal scrollbar appears and drags.
3. Search filters by name and SSID. Sort by status pushes red to the top.
4. Branches dropdown filters instantly (no page reload); the URL keeps ?branch=.
5. View dropdown switches Main / Hospital / Respite / Cancelled instantly; Summary navigates to /service-users/summary.
6. Empty states read correctly for each view (Main invites adding the first service user).

## Add a Service User
7. Add service user: name + branch required; SSID optional; package start date optional. Branch choice auto-fills the caseload supervisors (tick/untick).
8. Saving a second Service User with the SAME SSID in the same company is rejected with a clear message.
9. After adding, the four SU checks (Care Plan Review, Risk Assessment, MAR Audit, Consent Review) are applied, each with an initial due date one interval after the package start date.

## The compliance loop (Care Plan Review)
10. Open the record: the Care Plan Review card shows Most recent review, New review due, Planned review date, Review status.
11. Complete a Care Plan Review (enter a Date of review): evidence is stored, Most Recent Review = that date, New Review Due = that date + 12 months, and any Planned Review Date booking is cleared.
12. Completing again with the same evidence does not double-advance (idempotent) — re-submitting is safe.
13. Complete a Risk Assessment / MAR Audit / Consent Review: each stores evidence and advances its own next due date (MAR monthly, the others annually).
14. Evidence history lists each completion (date + author), newest at the top.
15. Completion is stamped from the DATE ON THE FORM, not submit time: a back-dated review schedules the next due from the back-dated date.

## Planned Review Date booking
16. Click the Planned Review Date cell: a calendar + reviewer selector opens. Pick a date and a reviewer, Book in.
17. Review Status then shows "Booked In" (green). The cell shows the date + reviewer name.
18. Clear removes the booking; Review Status returns to Awaiting Review (or Overdue if past due).
19. NOTE (deferred): the reviewer does NOT yet receive a calendar-invite email — that ships in Phase 6. Confirm no email is expected here.

## Review Status auto-derivation
20. Review Status = Overdue (red) when New Review Due has passed.
21. Review Status = Booked In (green) when a Planned Review Date is set and the review is not overdue.
22. Review Status = Awaiting Review (neutral) otherwise.

## Status pill + views movement
23. The Status pill (Active/Hospital/Respite/Cancelled) changes inline with a "Moved to X" toast, and the record leaves the current view instantly.
24. Cancelled records are excluded from Main, the dashboard and the Summary counts, but appear in the Cancelled view.
25. In the Cancelled view the Status pill offers Archive; archiving removes it from Cancelled (kept for audit). Restore from the record brings it back.
26. Transfer to another branch moves the record and its checks to that branch.

## Dashboard + summary
27. Dashboard shows a People strip and a Service Users strip; the SU strip counts compliant / due soon / overdue (cancelled excluded) and updates live.
28. /service-users/summary shows the SU RAG counts and the branch/view nav.

## Live refresh
29. With two browser windows on /service-users, completing a review in one updates the other within ~1s (realtime), and within 10s at worst (poll fallback).

## Settings
30. Settings > Service Users lists the four SU checks; changing an interval or amber window saves and updates the register RAG. It must NOT wipe existing New Review Due dates for uncompleted reviews.
31. Column names: setting a shorthand narrows that register column; clearing reverts to the full name.

## GDPR / special-category (may need roles/tenants — Not tested is fine, will log)
32. Opening a Service User record writes a service_user.viewed audit row (read logging, not just writes).
33. A Team Member who is NOT assigned to a Service User cannot see it anywhere (register, record, dashboard count).
34. An assigned Supervisor sees only their caseload, not the whole register.
35. Cross-tenant: a user of company A cannot read company B's service users / trackers / evidence.

## People regression (after the shared pill/scrollbar extraction)
36. People register Status / RTW limits / Probation status pill dropdowns still open, save inline and toast on a status move.
37. The People register horizontal scrollbar still drags and click-jumps.
