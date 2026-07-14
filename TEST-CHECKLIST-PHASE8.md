# Phase 8 test checklist: Reporting, exports and audit trail

## Live run 2026-07-13 (Claude driven in Chrome + DB verified, signed in as Akram Abappa, company_admin, Thistle Enterprise)

PASSED:
- A1/A2 Evidence PDF on demand: opening /api/evidence/<id>/pdf rendered a branded PDF from the frozen snapshot to the /render/ path, 302 to a Supabase signed URL whose token iat/exp were exactly 300s apart (5 min TTL). evidence.downloaded audit row written (actor, "Downloaded evidence PDF", ttl 300). Clears the parked "evidence PDF on demand" + "5-minute signed-URL download audit-logged" items.
- B1 Evidence pack: /api/reports/evidence-pack for the Person gathered 18 evidence rows, rendered without error, wrote report.exported (evidence_pack, ev_count 18).
- C1/C4 Register + Compliance reports: both rendered and wrote report.exported (register people PDF; compliance PDF).
- Reports area + tier gating: /reports shows the four cards + PDF/CSV buttons for the entitled Enterprise admin; Admin sees Open audit log + Export PDF.
- D1 Company audit viewer (/reports/audit): filters (actor, area, from/to), Export PDF/CSV, table newest first showing report.exported, evidence.downloaded, billing.subscription_cancelled, user.deleted, user.status_changed, invite.accepted.
- D5 Per record History tab (Person): oldest at top newest at bottom, record changes ("Added ... to the People register") + Evidence events ("Completed Probation form"), each with time + actor + entity tag; three export buttons present; Evidence history rows each have a working PDF button.
- E1 GDPR read audit: opening the Service User record wrote service_user.viewed ("Viewed Charley Chapplin") live. Clears the parked "GDPR read audit" item.
- F5 Delete user dialog: styled modal (title, warning naming the user, red Delete + Cancel), not a native confirm; Cancel closes with no deletion.
- D3 Founder cross company console (/founder/audit, signed in as phil.davies@outlook.com platform_admin): extra Company column + founder only Company id filter + Export PDF/CSV; the founder PDF export wrote report.exported (scope founder, 250 entries, company_id null).
- Business tier gate (Thistle temporarily flipped to business, then back to enterprise; signed in as Tim Mingle, manager): /reports showed the "Reporting exports are a Pro feature" upgrade card with the single evidence carve out wording and NO download buttons on the report cards; /api/reports/register returned the plain text 403 "Reporting exports are available on the Pro tier and above." (C6, server side). A4 single Evidence PDF STILL rendered on business (the exception) and showed the full branded inspector PDF (Be Care Compliant header, Thistle / Newport, completed by Akram Abappa, Version 4, all sections, no dashes). Bonus G2: the manager saw the audit card note "available to Company Admins" (no company audit log for managers).

STILL TO TEST (cold or needs another tier/tenant/role, logged to Final Testing):
- Cross tenant export isolation (G1): needs a second company.
- Team Member / Supervisor isolation (G2): needs those roles; supervisors do not get the History tab by design.
- Save button visual sweep per control (F1 to F4): converted and typecheck/deploy clean; spot check each Saving/Saved/error live when convenient (mutates data).
- CSV content inspection (B2, C2, C3): open the downloaded CSVs and eyeball columns/values.
- A3 real 5 minute expiry: confirmed TTL=300 in the token; actual expiry needs a wait.


Run as popups, one check at a time, Pass / Fail / Not tested. Anything Not tested is logged to Final Testing. Test on the deployed build (Vercel) with migration 0058 applied to ref bgrtcvyjuwopunpnudeu.

Prerequisite: Thistle is Enterprise, so reporting_exports is ON there. To test the Business gate and single evidence exception, a Business tier company (or a temporary tier flip on Thistle, reverted after) is needed.

## A. On demand Evidence PDF (single record, all tiers)

- A1. Open a Person with evidence. On an Evidence history row, click PDF. A branded PDF opens (rendered on demand from the snapshot), matching the completed form.
- A2. The download wrote an evidence.downloaded audit row (check the record History tab or the company audit log).
- A3. The signed URL expires: reload the opened PDF URL after 5 minutes, it is no longer valid (403 from storage).
- A4. Business tier: the single Evidence PDF still downloads (the Business exception), even though register/pack exports are locked.
- A5. A legacy evidence row (created before Phase 8, has a stored pdf_path) also downloads and is audited.

## B. Inspection ready Evidence pack (Pro and above)

- B1. On a Person drill down History header, Evidence pack PDF produces one PDF: a cover page (record, company, branch, count, generated at) then every Evidence rendered in full, in order.
- B2. Evidence index CSV lists every evidence with reference, form, version, completed by, completed at, branch.
- B3. Same on a Service User.
- B4. A record with no evidence gives a pack with a clear "no completed evidence" note (not an error).
- B5. Business tier: the pack buttons are hidden and /api/reports/evidence-pack returns the Pro upgrade message.
- B6. Exporting a pack wrote a report.exported audit row.

## C. Register and compliance reports (Pro and above)

- C1. Reports page: pick All branches, People compliance register PDF. Summary counts match the People register (active only, leavers/archived excluded), overdue and due soon lists correct, probation block shows Original end due, Extension date, Actual end, Status.
- C2. People register CSV matches.
- C3. Service User compliance register PDF and CSV, active only (cancelled/discharged excluded).
- C4. Compliance report PDF (a branch, then All branches): People and Service User RAG summary + overdue lists, rolling up to the whole company when All branches is chosen.
- C5. Switching the branch selector changes the scope of every report.
- C6. Business tier: /reports shows the Pro upgrade card and the download buttons are hidden; hitting the routes directly returns 403 with the upgrade message.
- C7. RAG wording and colours read correctly (Compliant, Due soon, Overdue), no dashes anywhere in the PDFs or CSVs.

## D. Audit trail viewers

- D1. Company audit log (/reports/audit, Company Admin): lists changes newest first; filter by actor email, area, from/to date works.
- D2. A Manager cannot open /reports/audit (redirected); the Reports page shows them the "Admins only" note.
- D3. Founder audit console (/founder/audit): cross company, shows the Company column, optional company id filter works.
- D4. Company audit export PDF and CSV respect the current filters.
- D5. Per record History tab (Person and Service User): shows that record's changes and its Evidence in order, oldest at top newest at bottom.
- D6. Record history export PDF (from the History header) contains the same entries.
- D7. A change made now (e.g. transfer a Person) appears in all three views immediately after.

## E. GDPR read audit

- E1. Opening a Service User record writes a service_user.viewed row (already wired; confirm it appears in the audit log).
- E2. Downloading any Evidence writes an evidence.downloaded row.
- E3. People record opens are NOT logged (by design, not special category), confirm no person.viewed spam.

## F. Save button sweep and delete dialog

- F1. Founder console: Activate / Suspend / Archive a company shows "Working" then the row updates; a refused change shows a visible error.
- F2. Person drill down: Apply missing, RTW limits Save, Probation status Save, Transfer, Assign, Remove, Save status, Archive/Restore all show Saving then Saved/updated, with inline errors on failure.
- F3. Service User drill down: the same set (Apply missing, Transfer, Assign, Remove, Save status, Archive/Restore).
- F4. Settings > Users: Resend and Revoke invite, Disable/Enable user show Saving and feedback.
- F5. Delete user: clicking Delete user opens the styled dialog (not a native confirm). Cancel closes it. Confirm deletes, closes and the list refreshes. The dialog remounts cleanly if reopened.
- F6. Try to disable/delete yourself or an Admin: refused with a visible message.

## G. Security and correctness

- G1. Cross tenant: a user of company A cannot export company B's reports or evidence (RLS blocks the reads; routes return not found / no rows).
- G2. Team Member / Supervisor: no Reports nav entry; direct /reports redirects them; they cannot get a record History tab (RPC returns nothing for non managers).
- G3. Evidence pack and reports exclude leavers, archived people and cancelled/discharged service users (matches registers).
- G4. audit_log stays append only (no insert/update/delete via API); report.exported and read audits are present.

## Cold / cannot test from the agent environment

- Signed URL 5 minute expiry (A3) needs a real wait or clock.
- Business tier gating (A4, B5, C6) needs a Business tier company or a temporary tier flip.
- Cross tenant (G1) needs a second company.
- Team Member / Supervisor isolation (G2) needs those roles in Thistle.

## H. On time report, report View pages + date filter, reporting deadline (logged to Final Testing 2026-07-14)

Context: added after the 2026-07-13 run. All items below are UNTESTED in the UI; the on time figures were verified only by reproducing the engine in SQL. Test signed in as a company_admin or manager on Thistle (Enterprise) unless stated. Cardiff branch = 9e1c6cc9-d89b-4fbf-96d9-5f06d587ba4b.

### H1. Report View pages (all four reports)
- On /reports, each of People register, Service User register, Compliance and On time now shows a **View** button (primary) alongside Download PDF/CSV. Click View on each: it opens /reports/view/<type> and renders the report on screen (not a download), with a Back to reports link.
- Non entitled tiers still see View (View is never gated); only the downloads are Pro+.

### H2. Date range filter on the View page
- Each View page shows a From / To filter. People/SU/Compliance default to "overdue + next 30 days" (From blank, To = today+30). On time defaults to the **last 6 months** (From = today-6mo, To = today).
- Change From/To then Apply dates: the on screen report and the Download PDF/CSV links both reflect the chosen window (check the href carries from/to). Reset returns to defaults.

### H3. On time report is per branch only
- With "All branches" selected on /reports, the On time card shows the amber "choose a branch" note and NO View/Download. Pick Cardiff: View/Download appear.
- Direct hit /reports/view/on-time with no branch shows the "always for a single branch" empty card, not a crash.
- /api/reports/on-time?format=pdf with no branch returns the 400 "must be run for a single branch" text.

### H4. On time report content (Cardiff)
- View the On time report for Cardiff, default 6 month window. Expect a summary table with columns: Check, Register, **Graded at**, Due in period, On time, On time rate, PQS score; then a per cycle breakdown (late first).
- Sanity vs the SQL reproduction on 2026-07-14: Spot Check ~75.6%, Appraisal/Manual Handling/Medication Competency ~100%, Supervision **48.1%** (graded at 90). These shift as data/date changes; the point is they are populated and non zero, and Supervision shows "90 days" under Graded at (not 80).
- PQS score bands: 100%=10, 85 to 99.99=7, 70 to 84.99=5, 50 to 69.99=2, under 50=0. Check one row's band matches its rate.
- Download PDF and CSV: both open; report.exported audit row written (report on_time, branch_id Cardiff, format).

### H5. Reporting deadline config field (migration 0059)
- Settings > People checks: each recurring check now has an optional "Reporting deadline (days)" box (placeholder "Same as interval"). Supervision should already show 90. Set a value on another check, Save: button goes Saving then Saved; reload shows it persisted.
- Clear the box and Save: it goes back to blank (null), meaning "grade against the interval".
- Settings > Service User checks: same field present; Care Plan Review shows 90.
- Enter 0 or a negative: rejected/ignored (must be >= 1), no crash.

### H6. Reporting deadline actually changes the on time report, and ONLY that report
- With Supervision reporting deadline = 90, the On time report grades supervision cycles at 90 days (Graded at column = "90 days"). Temporarily clear it to blank and re-view: supervision drops (graded at 80, ~33% on the current Cardiff data), Graded at shows "80 days". Restore to 90.
- Confirm the **register is unaffected** by the reporting deadline: a supervision's amber/red RAG and its next due date on the People register and the person drill down still follow the 80 day interval, not 90. (The reporting deadline must never move a due date or a RAG.)

### H7. Sticky Carer column hover fix
- People register (dense matrix). Hover a row: the sticky Carer name cell stays opaque (navy), the name does NOT bleed through / show the row hover colour behind it. Check at a scroll position where rows sit under the sticky column.

### H8. Daily reporting emails (from the digest cron)
- Already fired once live 2026-07-13 (6 test emails then restricted to admin+managers). Cold confirm on a normal 07:00 London run: admins get 2 company wide emails (People, Service Users); managers get 2 scoped to their branches; supervisors keep the caseload digest. People email is compliance checks only (never holiday/absence). Layout is 3 columns Name / Task / Date, "Overdue DD/MM/YYYY" for overdue, "DD/MM/YYYY" for due soon (next 14 days). All clear email still sends when nothing is due.
