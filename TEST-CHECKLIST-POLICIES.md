# Test checklist: Policies department (2026-10-06)

Bevan first, then Thistle and every company.

## Department and access
- PD1 Policies is in the side menu between Incidents and Briefings; Settings has no Policies tile; /settings/policies opens /policies.
- PD2 Role access: Branch Manager, Registered Manager and Responsible Individual tiles carry "Policies: can write and approve, like an Admin", off by default.
- PD3 Ticked for Branch Manager: a Branch Manager sees Write and Improve and the full library, and can add a policy. Unticked: they see the read only list.

## Guidance library (Founder)
- PL1 Founder, Policy library: "Load and check every source now" loads the sources; each shows Loaded or an error.
- PL2 Any source in error has its link fixed.
- PL3 A changed source shows "Change waiting" with a summary; "Approve and tell companies" marks every company policy on that topic; "Approve quietly" does not.
- PL4 The daily cron at 03:30 rechecks sources 28 days old (CRON_SECRET guarded).

## Write with AI
- PW1 Write a policy with AI: choose Complaints, answer the questions, Write the draft: a draft opens within about a minute.
- PW2 The draft is written for Wales on a CIW company (CIW, Social Care Wales, Public Services Ombudsman for Wales), cites [S1] etc, and marks [To be completed] gaps; no dashes.
- PW3 Approve as a new policy: it appears in the library and the checklist ticks Complaints; the PDF ends with the Sources list.
- PW4 One AI credit is used and the usage is metered.

## Improve with AI
- PI1 Improve an existing policy (written and an uploaded PDF): the review lists gaps with severity and source, and each section shows yours and the suggestion.
- PI2 Keep some, use others, approve as the next version: version goes up, review date restarts, signing follows the policy's rule.

## Checklist and register
- PC1 The checklist shows the regulator's policies with ticks and Write with AI links; setting "Which standard policy is this?" on an existing policy ticks it.
- PC2 Review register: review date pill red/amber/green, owner select, "Reviewed, no changes needed" moves the date on by the review period.
- PC3 A policy past its review date shows on the dashboard Overdue tile and the Overdue report; one due in 30 days shows in its band.

## Library approvals (2026-10-06)
- PL-A1 Approve all quietly: 2 test changes approved in one press, waiting section gone, no company policies flagged. PASS (tested by Claude in Chrome, DB checked).
- PL-A2 A source that fails its check drops its waiting change and cannot be approved: by code and unit tests only (no live failing source to try it on).
- PL-A3 Legislation pages hold only the law text (9 re-loaded clean, 71 of 71 loaded, 0 failed). PASS (DB checked).

## HR policies and set up (2026-10-06)
- PH1 Policies page shows "HR policies" with 18, missing first, Write with AI on each. PASS (Bev, page text read by Claude).
- PH2 Write: Sickness absence shows "From your set up" with Bevan's stages (6 months; 1, 4, 6, 8 absences) and the draft states them exactly.
- PH3 Write: Probation shows "3 months" from set up and the draft uses it.
- PH4 Write: Holiday asks entitlement, irregular hours, holiday year, notice, carry over.
- PH5 Writing takes 3 credits, improving 4; a failed write gives all of them back; too few credits gives "This uses 3 AI credits and you have N left."
- PH6 Getting set up: absence and probation steps sit before "Write or upload your policies"; saving each ticks it (Bevan and Thistle absence already ticked by backfill).
