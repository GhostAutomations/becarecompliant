# Decisions index

Phil's standing decisions and the lessons behind them, by area. Read the matching file before
changing an area, and keep it current: when Phil makes a new standing decision, add it to the
right file (or a new file listed here) in the same session.

- Copied from the Claude project memory on 10 October 2026. `[stated]` marks Phil's own words.
- Personal details of Thistle staff and service users were left out on purpose. Keep it that way.
- Some files are build history (what was built, tested or found). Check the code before relying on
  them for what exists today (`../process/tracking-drift.md`).
- Acme Care Company, named in older files, was the test company before Bevan Care Ltd. It has been
  deleted. Today there are three companies: Thistle Care Ltd (live), Bevan Care Ltd (test) and Demo
  Care Company Limited (demo).

## How Phil wants work done (`docs/process`)

- [all-companies-means-the-seed](../process/all-companies-means-the-seed.md): see file
- [help-requests-during-testing](../process/help-requests-during-testing.md): Standing rule from Phil (2026-07-12, upset): a help request inside a test popup must halt testing and get a real visible walkthrough, never another popup. Extended 2026-08-19: 'talk me through it' means HE presses the button, not that Claude narrates while doing it
- [look-at-the-artefact](../process/look-at-the-artefact.md): STANDING RULE from 2026-08-11: eleven defects across three sessions, none visible in the code, unit tests and tsc green through every one. The specific checks that actually find them.
- [popup-answers](../process/popup-answers.md): STANDING RULE (Phil, 2026-10-03) — how to read Phil's typed answers in popups; never re-ask a question he has already answered. Read before every AskUserQuestion follow-up.
- [test-now-not-final-testing](../process/test-now-not-final-testing.md): Standing rule from Phase 13 on — Final Testing (Phase 11) is already passed, so anything untested must be tested now, never logged to Final Testing. Read before writing any test checklist or "not tested" line.
- [test-steps-format](../process/test-steps-format.md): How Phil wants test steps laid out when he runs a test himself (2026-09-30). Read before any test popup that has more than one step.
- [tracking-drift](../process/tracking-drift.md): Standing rule after 2026-07-27: never state what is left to build from PHASES.md or memory alone — verify against the code first
- [working-preferences](../process/working-preferences.md): How Phil wants Claude to work on Be Care Compliant (project-level additions to the account preferences)

## Decisions by area (`docs/decisions`)

- [absence-discounting](absence-discounting.md): Discounting absences, restarting the count, recording unbooked meetings, and Return to Work on the dashboard — Phil's decisions 2026-09-24 from the Thistle monday import. Read before touching absence counting, stages or the Absences dashboard tile.
- [absence-round2](absence-round2.md): Phil's Absence changes list 2026-09-29 (Phase 13) — meeting invite approval, AI meeting questions, AI outcome letter, stage actions in Settings. Read before touching absence meetings, letters or Settings > Absence.
- [assignments-policies](assignments-policies.md): BCC assignments, the policy library, signed policies, per-policy signing rules, written/pasted policies, the signed copy, standing policies for new starters and the briefing emails (0133/0135/0136/0137/0138)
- [audit-2026-10-decisions](audit-2026-10-decisions.md): Phil's standing decisions from the October 2026 security and bug audit (popups 3 to 4 Oct) that apply to future BCC work, e.g. dash rule scope, who counts in Readiness, support mode and Evidence.
- [audit-check](audit-check.md): Audit check + form on BOTH People and Service User matrices (Acme only), monthly, migration 0121; VERIFIED LIVE 2026-07-25 (4/4 pass); auditor_name is now a user dropdown preselected to the signed-in user (0125 + fieldToNameSelect)
- [back-navigation](back-navigation.md): Standing UI rule — every sub-page needs a clear Back link (BCC)
- [branch-billing](branch-billing.md): Extra branches — how they are counted, billed and (from 0181) removed. Read before touching branch counts, the founder branch screen, or anything that deletes a branch. The foreign keys onto branches will erase Regulation 73 and 80 records if you let them.
- [brand-decisions](brand-decisions.md): Be Care Compliant brand and design system decisions (standing rules)
- [brand-positioning](brand-positioning.md): The agreed position ("the operating system for care compliance"), the confidence-not-software frame, the hero rules, and the four parts of Phil's designer brief that were REJECTED and why. Read before changing marketing copy, the hero, the palette, or proposing a Compliance Score.
- [briefings](briefings.md): BCC vocabulary — "Briefings" is the department for policies to sign and forms to complete (was Assignments, promoted out of People 2026-07-26); includes the audience rules, icon rule, and the 2026-08-11 catalogue/holiday/identity hardening
- [cardiff-pqs](cardiff-pqs.md): Cardiff Council PQS (Provider Quality System) monitoring return that BCC reporting must help providers prepare
- [care-plan-review-form](care-plan-review-form.md): BCC Care Plan Review check completes the founder Individual Plan Review form (not the thin auto-generated one)
- [cloud-drive](cloud-drive.md): Phil's decisions on BCC cloud drive copies (OneDrive/SharePoint, folder layout, next providers). Read before touching cloud drive filing or adding a provider.
- [company-deletion](company-deletion.md): How a company is deleted and erased (built + PROVEN end to end 2026-08-19, migration 0209): the two stages, the tombstone, the company LOCK that fixed Suspend doing nothing, why the company row is deleted BEFORE the logins, and the eleven defects the work exposed. ACME IS PURGED. Read before touching companies.status, companies.regulator, company_deletions, requireCompany, deleting any auth user, or the 02:30 cron.
- [complaints-final-testing](complaints-final-testing.md): Complaints batch verified live in Chrome 2026-07-16; one behavioural test logged to Final Testing
- [complaints-section](complaints-section.md): BCC Complaints = agreed Additions item: third top-level section, case-lifecycle model; PERMANENT rule 2026-07-25: the Type field alone decides the formal flow
- [compliance-cycle-redesign](compliance-cycle-redesign.md): Major agreed change (2026-07-18) to how Supervision/Appraisal + Care Review schedule and colour, all companies — NOW BUILT, verified in code 2026-07-27
- [custom-register-columns](custom-register-columns.md): Custom register columns (Additions item 6): parked July, BUILT 2026-08-03 with the display picker; the six review findings, the default-hidden migration, and the manage-as-expiry silent-write gotcha
- [dashboard-redesign](dashboard-redesign.md): Company dashboard stat-card redesign (2026-07-17) + the completed-one-off due_date gotcha
- [default-branch](default-branch.md): Phil's agreed rules (2026-10-05, current phase) for which branch People compliance, Training and Service User compliance open on, and per-screen remembered branch. Read before touching register branch defaults.
- [demo-and-deal-setup](demo-and-deal-setup.md): Phil's spec (2026-09-30) for the Demo Care Company Limited demo/trial logins, founder-built customer setup (tier, seats, branches, trial length, agreement then payment), renaming "branch" per company (e.g. "house"), and negotiated per-branch pricing. Read before planning or building any of it.
- [design-demo](design-demo.md): REVIVED + SHIPPED 2026-07-25. Phil asked fresh to make the real app look like the crisp navy+gold demo, Acme only. Now LIVE on production (main) for Acme via companies.ui_theme='navy' (everyone else 'classic', migration 0123_ui_theme_flag). Ongoing critique/polish. Details below; original demo history further down.
- [email-allowlist](email-allowlist.md): Email domain allowlist (item 2 on [the-list](the-list.md)) — scope corrected by Phil 2026-07-29, it MUST be role aware or it breaks Team Member logins
- [final-testing-part1](final-testing-part1.md): Final Testing Part 1 (UI/UX + functional sweep) COMPLETE 17 Aug 2026: all six roles swept, 15 fixes in 3 batches, verdict GO for soft launch. Read for what was verified, the open non-blocking findings awaiting Phil, and the two tiny carried-forward checks
- [final-testing-part2-security](final-testing-part2-security.md): Final Testing Part 2 (security & permissions pen-test), 17 Aug 2026: verdict GO. Tenant + privilege isolation proven; the ONE real defect (5 staff-reachable management pages) fixed; headers added; the Low open items and the RLS/anon test technique. Read before any security discussion or a real-company onboard
- [form-builder-round](form-builder-round.md): Phil's form builder round (2 Oct 2026, Phase 13) — delete a library form, send a form to a single company, AI import from a link or file. Read before touching the founder template library, Send to companies or form import.
- [form-renderer-hooks-bug](form-renderer-hooks-bug.md): Form completion client crash React
- [founder-inbox](founder-inbox.md): The Founder email inbox inside BCC (Inbox / Sent / Other / Deleted tabs) and Phil's decisions about how mail is sorted. Read before touching the founder inbox.
- [framework-readiness](framework-readiness.md): Inspection Readiness module (foundation for the AI compliance assistant): maps checks/outcomes/satisfaction to CQC key questions / CIW themes; Acme-only beta (the company formerly named Thistle, renamed 2026-07-23) via companies.framework_enabled; migrations 0109/0110/0111
- [freedom](freedom.md): Freedom = the care-management expansion, PROMOTED 2026-08-13 to Phase 14 / Operation New Dawn (Nourish scheduling + Birdie care recording/eMAR); locked decisions incl. £249 pricing, the staff-app decision change to installable web app first, route/cost/grant analysis, roadmap doc location
- [holidays-absence](holidays-absence.md): BCC Holidays & Absence: People sub-sections being built now, decisions + data model
- [incidents-whistleblowing](incidents-whistleblowing.md): Incidents & Safeguarding and Whistleblowing (0174-0178, 0182) — the two category lists SIGNED OFF by Phil, who can see what, and why anonymous means anonymous in every column. Read before touching either register, the Reg 80 prefill, or their audit entries.
- [invoice-unit-price](invoice-unit-price.md): Invoice line maths (list item 7). SETTLED RULE: a line is quantity x the printed unit price, both rounded to the penny. Migration 0164 dropped 0163's unit_price_exact. Read before touching invoice line maths or the invoice/PDF line table.
- [invoicing](invoicing.md): BCC Invoicing department (Private Client invoicing) — agreed scope, schema, and build progress
- [launch-form-set](launch-form-set.md): The exact 19 forms a new BCC company launches with, the seed alignment, and the standing rule that default forms stay at v1 while they are being built
- [leavers](leavers.md): Making a Person a leaver (2026-09-23) — leaving date rules, login on leaving/rejoining, and the leaver questions Phil wants; read before touching People status/leaver code.
- [letters-rtw](letters-rtw.md): Editable company letter templates, the absence meeting Outcome section, and AI Return to Work — built and DEPLOYED GREEN 2026-07-27, migrations 0139-0143; live testing still outstanding
- [marketing-4b-in-progress](marketing-4b-in-progress.md): Item 4b marketing pass — COMPLETE 2026-07-29 except one thing needing Phil (a real testimonial quote). What was changed, and the two review findings that turned out to be wrong.
- [mentoring-check](mentoring-check.md): Mentoring ad-hoc People check (Acme only), copied from Phil's monday Mentoring Support Record; non-recurring schedule_mode='ad_hoc', shows in Checks section not the matrix, migration 0122; VERIFIED LIVE 2026-07-25, all pass
- [missing-dbs-rtw](missing-dbs-rtw.md): Audit W1 rule (Phil, 2026-10-03) — a DBS or Right to Work never recorded is red from the start date on every screen. Read before touching DBS/RTW colouring, rollups, dashboard, digest or Readiness.
- [new-dawn-features](new-dawn-features.md): Phil's own New Dawn (Phase 14) feature list, in his words, as he gives it, plus the decisions on each. Read before planning or building New Dawn features.
- [on-call](on-call.md): On Call department (Additions) + new on_call user role: rota + call log, Pro-gated; on_call role limited to On Call/Absence/Complaints across all branches with roster read; migrations 0113/0114
- [oncall-finalise-verdict](oncall-finalise-verdict.md): On Call finalise flow, PERMANENT UX rule Save opens the finalise popup (one button, no separate Finalise button); DEPLOYED and RE-VERIFIED LIVE 2026-08-11 (finalised=true, read-only, no console errors)
- [one-account-per-email](one-account-per-email.md): DEF-009 decision (2026-09-23) — one login account per email address; someone on two companies needs a separate email. Read before touching invites or account moves.
- [operations](operations.md): Phil's naming for the whole programme, 2026-08-13: Operation Launch (phases 0-12), Operation Thistle (phase 13), Operation New Dawn (phase 14 on). Wales only to start. Read before discussing scope, roadmap, pricing reach or what phase anything belongs to.
- [outcomes](outcomes.md): BCC Outcomes sub-department (Service Users): personal outcomes -> PQS %; agreed design + build progress
- [paper-evidence](paper-evidence.md): Upload a Check completed on paper as its Evidence (DEF-056, 2026-09-23) — Phil's agreed rules; read before touching the Complete page or evidence dating.
- [permission-boundaries](permission-boundaries.md): BCC role permission boundaries as ACTUALLY ENFORCED, verified against the live database 2026-08-14. Supervisor is branch-wide (not caseload), Viewer is the team_member role relabelled. Read before reasoning about who can see or do what.
- [phase10-round1](phase10-round1.md): BCC Phase 10 Additions Round 1 slice, decisions and build state (import templates + Complaints built)
- [phase2-decisions](phase2-decisions.md): BCC Phase 2 (forms engine & evidence) agreed scope decisions from popups 2026-07-08
- [phase3-decisions](phase3-decisions.md): BCC Phase 3 (People section) agreed scope decisions from popups 2026-07-08
- [phase4-built](phase4-built.md): BCC Phase 4 (Service Users) build outcome, schema-reuse + booking decisions, deferred invite email
- [phase4-carryover](phase4-carryover.md): Patterns from Phase 3 (People) that Phil wants carried into Phase 4 (Service Users)
- [phase5-built](phase5-built.md): BCC Phase 5 (Form builder) decisions + build state, migrations 0038/0039
- [phase6-built](phase6-built.md): Phase 6 Notifications COMPLETE, signed off by Phil 2026-07-13: digest send proven live (manual Run + gate now 07:00-onwards with per-day dedupe), migrations 0043-0055; cold checks in Final Testing
- [phase7-decisions](phase7-decisions.md): BCC Phase 7 Billing & tiers — agreed Stripe architecture, pricing and tier contents
- [phase8-decisions](phase8-decisions.md): BCC Phase 8 (Reporting, exports & audit trail) agreed scope decisions, popup 2026-07-13
- [photo-evidence-pdf](photo-evidence-pdf.md): Item 15, photo evidence on the Evidence PDF and on screen (built 2026-08-11): what draws, the caps, why the image box is measured not square, and the Supervision 4 dead end found beside it
- [planner](planner.md): Planner department (Additions): book any check or ad-hoc task to a conductor + date; My Planner, month Whiteboard, record panel. Times and double-booking enforced in the DB (0179/0180). A booked conductor can see that one carer (0183), which also closed a privilege escalation in the insert policy.
- [policies-department](policies-department.md): Phil's decisions (2026-10-06, Phase 13 current phase) for Policies as its own BCC department with an AI policy writer/improver, guidance library and policy writer roles. Read before touching Policies.
- [policy-signing-ux](policy-signing-ux.md): BCC — reading and signing a policy on a phone (the DocuSign pattern), the pdf.js reader, the read gate and its two failures, the signed copy, and the signature pad bugs
- [portal-holiday-fix](portal-holiday-fix.md): The /my portal Holiday form no longer asks a logged-in carer their own name, area or email (2026-08-10 fix)
- [probation-status-form-driven](probation-status-form-driven.md): Probation status is form-driven only, never an inline dropdown, everywhere
- [project-state](project-state.md): Be Care Compliant core infrastructure refs and the agreed phase plan (now phases 0-14, grouped into three operations)
- [public-forms](public-forms.md): BCC standing shift: Team Members won't have accounts; public web forms match to a Person by email
- [public-forms-built](public-forms-built.md): BCC public no-login forms BUILT 2026-07-26 (migrations 0126/0127/0128) — short link design, architecture, and Phil's 2026-08-02 decision to leave the whole feature dormant
- [record-updates](record-updates.md): The Updates section on People and Service User records (like Monday's updates), Phil's agreed design 2026-09-24. Read before touching record updates, mentions or the SU record check row layout.
- [recurring-invoicing-diagnosis](recurring-invoicing-diagnosis.md): Recurring invoicing 2026-07-27 — the "not working" diagnosis and the FIX that was built the same day (arrears billing, one maths path, Draft it now, editable schedule record)
- [refused-save-keeps-data](refused-save-keeps-data.md): STANDING RULE (Phil, 2026-10-01) — a refused save must never wipe what was typed, on any form or data entry point in BCC, including forms built in the form builder; and the Phase 13 audit of every form. Read before building or changing any form.
- [reg73](reg73.md): Regulation 73 (RISCA Wales) Responsible Individual branch visit report, pre-filled from site data
- [reg80](reg80.md): Regulation 80 (RISCA Wales) six-monthly Quality of Care Review report, built on the Reg 73 engine
- [retention](retention.md): Item 18, evidence retention actually enforced (built 2026-08-11): the clock, the nightly cron, the hold, the settings page, and the FOUR bugs live testing found in it
- [roles-overhaul](roles-overhaul.md): BCC roles/permissions redesign — confirmed matrix, ALL FOUR STAGES BUILT 2026-07-16; notification gap closed 2026-07-27; only per-role live testing outstanding
- [rtw-ai-questions](rtw-ai-questions.md): Phil wants the Return to Work QUESTIONS generated per absence by the AI, not fixed schema fields — the conflict with immutable Evidence and the way round it
- [rtw-form-v2-spec](rtw-form-v2-spec.md): Return to Work form v2 — FULLY SPECIFIED AND DECIDED 2026-07-27, ready to build with no further questions for Phil; item 1 on [the-list](the-list.md)
- [rtw-open-issues](rtw-open-issues.md): Return to Work — two findings from Phil's live test 2026-07-29 that are NOT yet fixed; pick these up first
- [rtw-sms](rtw-sms.md): Return to Work questions sent to the employee by SMS link to the portal (Phil's spec 2026-09-25). Read before touching RTW drafting, the /my portal RTW flow or SMS sends.
- [sar-export](sar-export.md): Subject access request (SAR) export for a Person or Service User — Phil's agreed scope 2026-09-24. Read before building or changing the SAR export or data-subject rights features.
- [satisfaction](satisfaction.md): BCC Service Users > Satisfaction sub-department: PQS User Experience Q2 from plan review feedback answers
- [save-button-behaviour](save-button-behaviour.md): Save buttons: "Saving…" at once, then green "Saved" that stays until the form is edited (send buttons: "Sending…" then "Sent"). The 2 second flash in the older blocks of that file is superseded.
- [scw-registration](scw-registration.md): Social Care Wales registration numbers on People (DEF-097, 2026-10-01) — where they show, are edited and tracked; Phil's popup decisions. Read before touching SCW numbers, the training matrix column or the PQS SCW measure.
- [seats-and-trials](seats-and-trials.md): Phil's rule, 2026-08-20: a CUSTOMER is never refused a seat (say what it costs, never block); a TRIAL is the exception because they are not a customer yet — 1 branch, 2 invites + the Admin. Read before adding any limit, gate or nag about seats, branches or billing.
- [seed-checks-values-null-gotcha](seed-checks-values-null-gotcha.md): BCC seed_company_people_checks amber_days text-vs-int bug and the Postgres VALUES all-null gotcha
- [self-serve-trial](self-serve-trial.md): Item 4c — founder approved trial provisioning AND the trial lapse gate. 0152 + 0153 applied, console and gate BUILT 2026-07-29, none of it run live. Read before touching trials, provisioning, guards or billing gates.
- [senior-role](senior-role.md): The "Senior" role Phil wants on every BCC company (2026-09-29) — a BUILT-IN default role (not a custom add-on), names only, ticks in Role access. Read before touching roles, Role access or the Senior role.
- [setup-tick-list](setup-tick-list.md): Two Phase 13 pieces agreed 2026-10-01 — (1) the 26 Sep creation tick list of Thistle's set up, then (2) the Admin "Getting set up" card. Read before planning or building either.
- [staff-logins](staff-logins.md): BCC Team Member logins — reversal 2026-07-26, agreed design, built and part-tested live (0131-0134), the free-seat rule, the four-places rule, what is left
- [stripe-prices](stripe-prices.md): The authority on BCC prices — the £69 Pro fix, the £7.50 branch price and the first real subscription, every Stripe id, the price guard (unit test + health panel + checkout refusal), and the fact that Stripe is a SANDBOX. Read before touching any price, tier or billing copy.
- [subscription-agreement](subscription-agreement.md): Decisions for the BCC customer contract (subscription agreement + DPA + in-app acceptance), Phase 13. Read before touching terms, DPA, acceptance flow or annual billing.
- [suite-handover](suite-handover.md): The JCN → Carer.Academy → BCC pipeline (Phil, 2026-08-14), part of Phase 14 / Operation New Dawn. Seven design decisions SETTLED, including why records are addressed by an opaque reference and never matched on company name or email. BCC RECEIVES ONLY, never pushes. Read before designing any cross-product integration.
- [testing-run-2026-08-10](testing-run-2026-08-10.md): Live testing run 2026-08-10 (Phil logged into Chrome): items 8, 9, 13 PASS and 14 mostly done, the defects it found, and the three that were fixed and pushed the same day
- [the-list](the-list.md): THE LIST, Phil's running to-do. When he asks for "the list" or "our list", show only the open entries with their numbers (his rule of 29 Sep 2026); never renumber, add new entries at the end.
- [thistle-forms-tasklist](thistle-forms-tasklist.md): Phil's nine-step task list agreed just before the Operation Thistle forms work (Sept 2026): compare forms to monday, agree corrections, fix the master library, fix Thistle's copies, build the push, then imports, import testing, Phil doing an import himself, and custom forms at onboarding. Steps 1-4 are done; step 5 (the push) is next. Read when asking what comes next in Phase 13.
- [thistle-systems](thistle-systems.md): The other care software Thistle Care uses alongside BCC (rostering, eMAR, notes) and the idea of pulling shift data from it. Read before discussing integrations with Nourish/CarePlanner or Birdie.
- [tickets](tickets.md): Phil's spec (2026-10-08) for the Tickets app in BCC: office users raise problems or feature requests to the founder, RAG rated, founder SMS and Founder console tile. Read before touching tickets.
- [tier-changes](tier-changes.md): How a company changes plan (built 2026-08-13) — the shared rule, why the tier is written before Stripe, what the nightly reconcile heals, and the five defects review found. Read before touching companies.tier, billed_tier, any subscription line, or the billing reconcile.
- [training-dept](training-dept.md): BCC Training sub-department under People: model, what is built, and the 2026-08-01 review findings (no renewal auto-calc, no reminders, no self service, Clear deletes with no confirm)
- [training-import](training-import.md): Training CSV import: how the column model works, the live test on Acme 2026-08-02 with both test files, and the after-import reporting hole that test exposed
- [unscheduled-checks](unscheduled-checks.md): Checks with no due date (Operation Thistle item 10, 2026-09-23) — how the readiness "no due date" count should treat ad hoc, waiting and new starter checks; Phil's popup answers.
