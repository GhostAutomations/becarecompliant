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
