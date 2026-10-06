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
- PH2 Sickness absence write: PASS (Bev). Real cost: Sonnet 5, 6,728 in / 3,151 out, about 3.4p.
- PH3, PH4 Probation set up box and Holiday questions: PASS (Bev).
- PH5 Too few credits: PASS (Bev, balance 2, refused with "uses 3 and you have 2", restored to 157).
- PH7 To be completed: each [To be completed: ...] in a draft shows as its own field between the policy and Save it as; answers replace the text on save; saving with any left blank is refused and keeps what was typed.
- PH8 Policy owner: Write with AI asks "Who owns this policy?" (required, defaults to you); the draft page shows it; approving sets it on the policy in the review register.
- PH7, PH8 tested by Claude in Chrome on Bevan (Grievance): owner question showed set to Bev Admin; draft had 3 To be completed fields; saving with one blank refused, naming it, answers kept; filled and approved: no gaps left, answers in the text, Bev Admin named. PASS.
- DEFECT found and fixed: AI policies were saved without their standard policy (topic_key), so the HR checklist did not tick and the owner was not set. createWrittenPolicy now saves topic_key. Grievance and Sickness absence repaired by hand.

## Cover page, ISO 9001 (2026-10-06)
- PCP1 Write with AI shows a Cover page section: Approved by (starts on the RI), Applies to, Read and sign, Retention, Classification.
- PCP2 The draft page shows the same, filled from the Write page, plus Reference (blank = automatic) and What changed (First issue for a new policy).
- PCP3 The saved PDF's first page is the cover: company, title, reference (POL-HR-001 for the first HR policy), version 1, approved on, approved by with role, owner, next review, applies to, read and sign, retention, classification, change history; then the policy, with the reference in the header and footer.
- PCP4 A second policy in the same area gets the next number (POL-HR-002); a deleted one's number is never given again.
- PCP5 A new version keeps the reference, and the change history lists both versions with what changed.

## Bevan's own register (2026-10-06)
- PRG1 Bevan's Policies page shows the register's 9 sections (Governance & quality ... Data & technology), each "X of Y in place", missing first, reg 12 tags, Write with AI on every row; total "X of 57" above. The standard regulator and HR lists are gone for Bevan only.
- PRG2 Thistle and Demo still show "Policies your regulator expects" and "HR policies" exactly as before.
- PRG3 Write with AI and Improve on Bevan list the 57 register titles only; an English company never sees Wales only policies.
- PRG4 After the founder Load and check, the 24 new standard policies (Business Continuity, Visit Scheduling, Statement of Purpose and so on) write from their sources.

## Library load, 2026-10-06 evening
- PL-L1 Load and check after the register work: 136 of 136 active sources checked, 0 never loaded, 0 errors; the 34 new sources for Bevan's 24 new standard policies loaded. PASS (Claude in Chrome as Founder, DB checked).
- DEFECT found and fixed: all six HSE sources were landing pages (400 to 1,300 characters of links). Now linked to each guide's print page, and the loader reads HSE's section list (print-guides/*.json) and every section in order, as the browser does. Result: lone working 9,016, drugs and alcohol 7,573, stress 9,484, driving 25,635, manual handling 10,695, risk 8,402 characters, no navigation scraps. PASS (DB checked).
- One waiting change: DBS checking service guidance, "No change in substance". For Phil to approve.

## Bevan register and cover page, run 2026-10-06 evening (Claude in Chrome as Bev)
- PRG1 PASS: 9 sections (8, 6, 3, 2, 5, 4, 20, 7, 2 = 57), "0 of 57", reg 12 tags, Write with AI on every row, no standard regulator or HR lists.
- PRG2 By data only: Thistle and Demo have no register rows, so they keep the standard lists. Not seen on screen.
- PRG3 PASS: Write and Improve both list exactly the 57 register titles.
- PRG4 PASS: Driving for Work written from the full HSE driving guide [S1] plus two GOV.UK sources.
- PCP1 PASS: cover page section on Write; Approved by "Not set" is right for Bevan (no Responsible Individual on the account).
- PCP2 PASS: draft page carried Approved by, Applies to, Read and sign, Retention, Classification; Reference blank; What changed "First issue".
- PCP3 FAIL then fixed: saved as POL-GEN-001, but the PDF opened from the library had no cover. The Open link draws written policies fresh (render.ts) and left the cover out. Now builds the cover from the saved version. Retest after deploy.
- Note for Phil: references are HR, CARE or GEN by the policy's regulator tag, so Driving for Work is GEN, not Health & Safety.
