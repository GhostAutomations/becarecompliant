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
- PCP3 FAIL then fixed: saved as POL-GEN-001, but the PDF opened from the library had no cover. The Open link draws written policies fresh (render.ts) and left the cover out. Now builds the cover from the saved version. Retest PASS: page 1 is the cover (company, title, POL-GEN-001, version 1, approved 06 October 2026 by Bev Admin, Admin, owner, next review 06 October 2027, applies to, read and sign, retention, classification, change history), then the policy, reference in every footer.
- Note for Phil: references are HR, CARE or GEN by the policy's regulator tag, so Driving for Work is GEN, not Health & Safety.

## Cover page like Thistle's (0410, 2026-10-06)
Phil's example: Thistle's Recruitment Process and Procedure. Decisions: logo large in the middle (no cover picture upload), two colour pickers in Branding (BCC navy and gold until set), page 2 is the Audit Checklist and Report then the ISO details, Reason for Review asked on approval.
- PCT1 Settings, Branding: Document colours with Main colour and Second colour pickers and a live preview; Save colours saves; "Use Be Care Compliant colours" puts navy and gold back.
- PCT2 Page 1: logo top right, logo large in the middle, company name in the second colour, band in the main colour with the policy title and reference in white. No footer.
- PCT3 Page 2: logo top right; Audit Checklist and Report table (date of review, date of last review, name and role, reason, changes, next review), then Document control and Change history, reference in the footer. Dates written 6th October 2026.
- PCT4 The draft page asks Reason for review (New policy for a new one, Annual review for a next version); the chosen reason prints on the cover.
- PCT5 "Reviewed, no changes needed" on the review register: the cover then shows that day, the person who pressed it, Annual review, None, and the earlier approval as the last review.
- PCT6 No logo: page 1 shows the company name and band only, nothing broken.
- Rendered here first with a sample (Bevan's details, a sample logo and colours): both pages match Phil's layout.
- Run 2026-10-06 23:45 (Claude in Chrome as Bev, deploy dpl_ELL9Xqv2):
  - PCT1 PASS: pickers and live preview; saved teal #1f6f78 and orange #c2410c (DB checked); "Use Be Care Compliant colours" appeared.
  - PCT2 PASS: page 1 company name in orange, teal band with title and POL-GEN-001 · Version 1, no footer.
  - PCT3 PASS: page 2 Audit Checklist and Report (6th October 2026, None this is the first issue, Bev Admin, Admin, New policy, First issue, 6th October 2027), Document control, Change history, reference in footer.
  - PCT6 PASS: Bevan has no logo; page 1 shows the name and band only, nothing broken.
  - PCT5 by unit test only: a same day "Reviewed, no changes needed" does not count as a later review, so it cannot be shown live today.
  - PCT4 not run yet (needs a new AI draft, 3 credits). Run with PCP4 and PCP5.
  - PCP4 PASS: Moving & Handling and Falls got POL-GEN-002.
  - PCT4 PASS: Reason for review offered on the draft (starts on New policy); chose "Inspection or audit finding", stored on the version and printed on page 2.
  - Found while testing PCP5: editing a written policy by hand gave no "What changed" or "Reason for review", so every hand edited version said "Updated" and "Annual review". Both added to the edit form. PCP5 to run after deploy, by hand edit (no credits).
  - Note for Phil: the 24 new register standards (Statement of Purpose, Notifications to CIW and others) carry no regulator tag, so they number as GEN, not CARE.
  - Phil, "and care": every standard policy numbers as CARE unless it is HR; GEN only for a policy that is not a standard one. Bevan's two test policies renumbered POL-CARE-001 and 002 (counter set to 2; GEN numbers 1 and 2 are never given again).
  - PCP5 PASS (by hand edit, after deploy dpl_95sChrXr): version 2 kept POL-CARE-002; cover shows Date of last Review (version 1's date), Change in how we work, the typed change, and both versions in the change history.
  - DEFECT found and fixed: with two versions the change history spilled one row onto a page of its own. Page 2 tightened; checked by rendering with five versions, all on page 2. Retest after deploy.
  - Phil (looking at page 2): "If a table is going to split ... the whole thing should be on the next page." Each cover table and its heading is now one block that moves to the next page whole; only a change history longer than a page (over 22 rows) may split. Rendered here with 9 versions: Audit and Document control on page 2, the whole Change history on page 3. Retest live after deploy.
  - Retest PASS (deploy dpl_2MFryFsr): Moving & Handling version 2, page 2 holds all three tables whole, both history rows on page 2, 7 pages, no stray page.
  - Phil, 2026-10-07: "Why is the reason review row so big? ... It only needs to be bigger if there's more text ... rule for all tables." Fixed height on Reason for Review removed; every cover row is as tall as its text. Checked every other PDF (Evidence, exports, invoices, letters): none has a fixed row height. Retest after deploy.
  - Retest PASS (deploy dpl_BLbgnL3o): Reason for Review is one line; page 2 tighter.
  - DEFECT found and fixed: the policy heading said "Issued 07 October 2026" (the day it was opened) on a version approved on the 6th. Now the version's own approval date, written "6th October 2026" like the cover. Retest after deploy.
  - Phil, 2026-10-07: removed "Uncontrolled when printed. The current version is held in Be Care Compliant." from the cover footer. Retest after deploy.
  - Retest PASS (deploy dpl_A8MLLLyf): footer shows only "POL-CARE-002 · Moving & Handling and Falls · version 2"; policy heading reads "Issued 6th October 2026" for version 2.

## Tidy up and Preview as PDF (Phil, 2026-10-07; built 2026-10-08, Phase 13)

Phil, after showing Thistle (testing in Bevan): a saved policy's PDF opens fine, but there was no
preview while creating one; and the Policies page needed folding and tightening. "Add a policy" is
REMOVED COMPLETELY (Phil's choice; PD3's "can add a policy" no longer applies). Existing policies come
in through Improve a policy with AI (upload or paste). Run now, not Final Testing.

- PT1 Policies page (Bevan): every register section is folded and reads e.g. "SAFEGUARDING 0 of 3 in place"; opening one shows its ticks and Write with AI links, with no count line inside the card.
- PT2 Review register is folded; opened, each row is about one line on a laptop (title, review pill, Standard policy and Owner beside it, Reviewed button). Change Standard policy and Save, change Owner and Save: each flashes Saved and sticks after a refresh. "Reviewed, no changes needed" still asks first.
- PT3 Library is folded; opened, there is no "Add a policy" button anywhere on the page; Open on a saved policy still opens its PDF.
- PT4 A Write with AI draft: Preview as PDF opens a new tab with the cover page, "Approved on: Not yet approved", the policy header reading "Draft preview, not yet approved" and the footer "DRAFT PREVIEW, NOT APPROVED". An edit typed but not approved shows in the preview. Nothing new appears in the Library or register, and no AI credit is spent.
- PT5 With a To be completed answer left blank, the preview shows the marked text; Approve still refuses to save.
- PT6 A draft saved as the next version of an existing policy: the preview shows that policy's own title and reference, the next version number, and its earlier versions in the change history.
- PT7 On a phone: sections fold and unfold; Review register rows wrap the dropdowns under the title.
