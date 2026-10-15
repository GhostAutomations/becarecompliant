# BE CARE COMPLIANT: ROTA AND VISITS MODULE (BEVAN ONLY, FOUNDER SWITCH)

Scope doc (Claude Docs): "Rota and Visits add-on scope", 15 Oct 2026.

==== STANDING RULES FOR THIS JOB (READ FIRST) ====
1. NO COLLATERAL DAMAGE. Before you change anything, record a baseline: the who-sees-what fingerprint from the speed job, page timings for Dashboard, People, Service Users, Planner and Readiness (the speed job's numbers and snippet), the Supabase performance advisor counts, and the realtime publication contents. After EVERY stage, re-check all of it. Your report must have a "Nothing else changed" section. Thistle, Demo and every other company must see no difference at all.
2. CLEAR QUESTIONS IN BULLETS. Every question to me is a popup (AskUserQuestion), one decision per popup, your recommended option first, labelled "(Recommended)". Whenever you ask me something or give me information in a popup, write it in short bullet points where possible, not paragraphs. Your reports to me are in bullets too.
3. READY FOR YOU TO LOOK. Only after the Vercel deploy is READY and migrations are applied, send a popup titled "READY FOR YOU TO LOOK", in bullets:
   - WHERE: exact URL, company, which user
   - WHAT YOU SHOULD SEE: what it looks like
   - Options: Pass / Fail / Not looked yet
4. STOP LINES. If you are not finished, end your message with exactly one of:
   NOT FINISHED. I NEED YOUR ANSWER TO CONTINUE.
   WAITING FOR YOU TO: (what I must do)
   SOMETHING FAILED: (what failed)
5. FINISH BLOCK. When the WHOLE module is done, your LAST message ends with:
   ========
   WE ARE DONE. THIS JOB IS FINISHED. READY FOR THE NEXT JOB.
   ========
   Done: ...
   Checked by you: ...
   Not done: ...
6. ONE STAGE AT A TIME. Each stage is its own commit, deploy and READY FOR YOU TO LOOK. Then stop with NOT FINISHED. I NEED YOUR ANSWER TO CONTINUE, and a popup asking me to approve the next stage. I decide when we move on.
7. Supabase project bgrtcvyjuwopunpnudeu ONLY. Confirm it before every apply. Every migration is also a numbered file in supabase/migrations.
8. Test data on Bevan ONLY. Never write module data for Thistle or any other company.
9. Never "item" or "board". No dashes in customer-facing copy. Branded CTA buttons in emails. Canonical controls in globals.css, no inline styling. Mobile first: carers use this on phones.
10. Check before you build: reuse what exists (registers, branches, roles, the forms engine and Evidence, Incidents, Out of Hours, holiday and absence, hospital and respite pauses, the staff leave pause, the carer portal, Senior Care Assistant role, SMS sender and credits, Planner, audit log, signed URLs, PDF and CSV export helpers). No parallel versions.
11. FIRST: check no other Code session is working on the repo. If one is running, stop with WAITING FOR YOU TO: finish it.

==== THE SPEED AND SAFETY GUARD (non-negotiable) ====
- ADDITIVE ONLY: new tables, new functions, new routes. Do NOT alter or drop any existing table, view, policy, trigger, function or the realtime publication. If you believe an existing object must change, ask me (popup) first and explain why.
- Nothing on existing pages may run a new query when the module is off. The module switch is read in the SAME company or tier load the app already does (lib/billing/tier featureEnabled pattern, React cache()), not a new round trip.
- No new tables in the supabase_realtime postgres_changes publication. Live updates use Broadcast on the private company channel, as the speed job did.
- No new triggers on existing busy tables (check_instances, people, service_users, person_training, evidence, audit_log). Read from them; never add work to their writes.
- Every new table: company_id (and branch_id where it applies), RLS using the existing helper functions, (select auth.uid()) wrapped, foreign keys indexed, plus the indexes the module's own queries need.
- New pages get loading.tsx skeletons shaped like their content, run independent queries in parallel, and target under 0.6 s from click to fully loaded.
- Re-run the speed job's timings and the fingerprint after every stage. Any regression on an existing page = stop with SOMETHING FAILED.

==== THE MODULE SWITCH ====
- A per-company module "Rota and Visits (beta)", OFF for every company by default.
- Founder console: a switch per company to turn it on or off, audit logged, Founder only (is_platform_admin). Turn it ON for Bevan Care Ltd only.
- Enforced server side everywhere: every module route, server action and RPC checks it. Every module table's RLS also requires the company to have the module on, so turning it off hides everything without deleting anything.
- When it is off, the company sees no nav entry, no tiles and no settings, and the module routes return not found.
- Turning it off and on again keeps all the data.
- Not on any price plan yet. Do not build billing for it (pricing is TBC; ask me before any billing work).

==== WHAT THE MODULE IS (agreed scope, 15 Oct) ====
Rota, planning, location, care plans, care notes and the MAR. Out of scope: invoicing and payroll. Planday and CarePlanner capabilities are the reference: copy capabilities from public information, never their screens, wording or templates.

STAGE 0: DECISIONS AND GROUNDWORK
- Ask me these as popups, one at a time, in bullets, recommendation first:
  1. PHASES.md: is this the first part of Phase 14 (New Dawn), or an Additions entry? Recommended: the first part of Phase 14, built early on Bevan only.
  2. Vocabulary: Rota, Shift, Visit, Run, Clock in, Clock out ("Check" already means a compliance requirement, so never "check in").
  3. A red DBS, Right to Work or mandatory training on a rota assignment: warn, or block? Recommended: block for DBS and Right to Work, warn for training, with a logged manager override.
  4. Outside the home's radius at clock in: allow with a reason and flag (Recommended), or block?
  5. Default home radius. Recommended: 200 m, editable per home.
  6. Proof of arrival for the first release. Recommended: GPS plus QR code, plus NFC on Android Chrome (Web NFC does not work on iPhone).
  7. Late alert: minutes after the start, and who gets it. Recommended: 15 minutes, to the office and whoever is on Out of Hours.
  8. Routing service for travel time and mileage (Google, Mapbox, OpenRouteService). Check cost, UK and Wales coverage and terms, then recommend one. It is a new subprocessor. Until I choose, build travel on stored postcodes with no live routing.
  9. Mileage rate default and exclusions. Recommended: the company sets the rate (HMRC's approved rate is 55p a mile for the first 10,000 business miles from 6 April 2026); exclude home to first visit and last visit to home by default.
  10. Retention for raw clock in positions. Recommended: 12 months, with the visit record kept as evidence.
  11. Does the MAR come in this build, or straight after? Recommended: in this build, on Bevan test data only.
  12. Speech to text supplier for dictated notes and setup audio (a new subprocessor), or leave dictation out for now? Recommended: leave it out for now.
  13. Add date of birth and GP practice to service user records (the MAR needs them under NICE NG67)? Recommended: yes, as optional fields shown only in this module while it is in beta.
  14. A carer without an in date medication competency: sees doses but cannot record them (Recommended), or does not see them at all?
  15. AI features (care plan from setup audio, MAR from label photos): build now or later? Recommended: later, after the hand built versions work.
- Then:
  - Add the module to PHASES.md where I chose, with every stage as a task.
  - Build the module switch, the Founder console control, and an empty "Rota" nav section visible on Bevan only.
  - Write the offline recording design (how the carer's phone stores clock ins, task outcomes, notes and doses with no signal and sends them later, without duplicates). It is the hardest part, so show me the design in bullets before Stage 3.
  - Write a template DPIA and a staff notice for location recording (the ICO expects both before worker monitoring), for each company to complete.
  - Write TEST-CHECKLIST-ROTA.md.

STAGE 1: ROTA FOR SHIFTS (the Planday side)
- Shifts for office and residential work: templates, copy a week, open shifts, staff request open shifts, swaps and handovers with manager approval.
- Availability per person; approved holiday, absence, blackout dates, mat leave and long term sick shown as unavailable; nobody rostered while unavailable.
- Working time warnings: weekly hours, rest between shifts, breaks.
- The compliance check on every assignment (as decided in Stage 0, item 3).
- The rota published to the carer portal; changes sent by text (one segment, one credit, through the shared SMS builder).

STAGE 2: VISITS AND RUNS (the CarePlanner side)
- Visit patterns per service user: days, times, length, number of carers, which tasks. Visits generated from patterns, idempotent: running it twice makes no duplicates.
- Runs per carer for a day; a timeline to drag visits between carers; move a whole run; cover for leave and sickness.
- Visits pause automatically for hospital and respite, and leavers and paused staff are never rostered.
- Recommend a carer: compliant first, then nearest (home postcode), then continuity and preferences.
- Dates and times in Europe/London, tested across the clock changes and month ends.

STAGE 3: CLOCK IN AND OUT WITH LOCATION
- Tap to clock in and out of a visit or shift. Store server time, phone time, position, GPS accuracy and distance from the home.
- Each home's map point from its address (the office can move the pin) and its radius.
- Inside the radius: fine. Outside: a reason is picked and the visit is flagged. Accuracy too poor: marked unclear. Never blocks care (unless I chose otherwise).
- QR code per home (printable, rotatable), NFC on Android Chrome, passcode by text for carers without a smartphone.
- Offline: built to the Stage 0 design.
- Position only at the tap. No tracking between taps.

STAGE 4: CARE PLANS AND TASKS
- One versioned care plan per service user, built on the forms engine and Evidence where it fits.
- Tasks attached to the visits they belong to. At the visit each task is marked done, refused or not needed, with a reason; key tasks can be required before clock out.
- The existing Care Plan Review check stays the review cycle.

STAGE 5: CARE NOTES
- A note per visit, author and time stamped, never editable after sending (a correction is a new note), stored as Evidence.
- Handover notes.
- A concern in a note can be raised straight into Incidents and Safeguarding.

STAGE 6: MAR (record, never decide)
- Medicines per service user from the NHS dm+d list, with dose, strength, route and the visits they are given at.
- Two person check before a MAR goes live: the person who set it up and a second trained person.
- At the visit the carer sees only the doses due then and records given, refused, not available or other, with a reason. No dose calculations, no clinical advice.
- Only a carer with an in date medication competency can record (as decided in Stage 0, item 14).
- Missed and late doses alert the office and Out of Hours.
- A printable MAR chart and rota as the paper fallback.
- Bevan test data only. Before any real service user uses it, the Clinical Safety Officer review and Welsh record keeping research must be done (New Dawn rule). Put that on the screen in the beta banner.

STAGE 7: LIVE ATTENDANCE AND ALERTS
- Today's visits for the office: not started, on time, late, missed, overrunning, tasks or doses not done; last known positions (from taps) on a map.
- A scheduled job (fails closed without CRON_SECRET) finds late and missed visits and alerts once per visit, to the people chosen in Stage 0.

STAGE 8: TRAVEL AND MILEAGE
- Travel time and road distance between consecutive visits from the routing service chosen in Stage 0, worked out when the rota changes and stored per postcode pair (never on page load).
- Warnings when the travel gap is too short.
- Mileage and travel time totals per carer, with the exclusions chosen, for whoever runs pay. Travel time between visits counts as working time for minimum wage.

STAGE 9: REPORTS
Every report filters by branch, dates, carer and service user, exports to PDF and CSV with the existing helpers, and leaves out leavers, discharged service users and paused records:
- Visit punctuality (late and early, in minutes)
- Missed visits
- Visit length against plan
- Location exceptions (outside the radius or unclear)
- Proof of arrival mix
- Rota coverage (unfilled shifts and visits)
- Compliance on the rota (assignments made despite a warning, and overrides)
- Continuity of care (number of different carers per service user)
- Working time
- Travel and mileage
- Hours delivered
- Tasks not done
- Note quality (no note, very short notes, concerns)
- Concerns raised from notes
- MAR outcomes (given, refused, not available, missed, late)
- Medication competency against what carers recorded
- Care plan currency (plans past review, visits delivered on an out of date plan)

GDPR (all stages)
- Service user care notes, plans and medicines are special category data. Same tenant and role isolation as the rest of BCC, enforced in RLS, with access audit logged.
- Location data: the DPIA and staff notice from Stage 0; office roles see their own branches only; carers see their own; retention as decided.
- Add the routing service and any speech to text supplier to the DPA subprocessor list only after I approve them.

TEST (every stage)
- Unit tests for the date and time maths, visit generation idempotency, radius and accuracy rules, the offline queue (no duplicates on resend), the compliance block and warn rules, and the SMS one segment rule.
- On Bevan: walk the stage as Manager, Supervisor, Senior Care Assistant and Care Assistant on a phone width screen.
- Confirm Thistle and Demo show nothing of the module and the fingerprint is unchanged.
- Anything not tested is written into TEST-CHECKLIST-ROTA.md and tested before the stage is closed.

==== REMINDER OF THE RULES (SAME AS THE TOP) ====
- Bevan only, behind the Founder switch, off for everyone else. Additive only. No slower pages.
- One stage at a time; I approve each before the next.
- Questions and information in popups, in bullets, one decision each, recommendation first.
- READY FOR YOU TO LOOK popups only after the deploy is READY and migrations are applied: WHERE / WHAT YOU SHOULD SEE / Pass, Fail, Not looked yet.
- Stop lines when not finished: NOT FINISHED. I NEED YOUR ANSWER TO CONTINUE. / WAITING FOR YOU TO: ... / SOMETHING FAILED: ...
- Supabase bgrtcvyjuwopunpnudeu only.
- Finish with:
  ========
  WE ARE DONE. THIS JOB IS FINISHED. READY FOR THE NEXT JOB.
  ========
  Done / Checked by you / Not done
