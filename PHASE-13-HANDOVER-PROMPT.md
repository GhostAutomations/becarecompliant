# Be Care Compliant: new chat handover (written 3 Oct 2026)

You are picking up Be Care Compliant (BCC) mid Phase 13 ("Thistle Care live"). Read this whole
prompt, then the files and memory it points to, before doing anything.

## 1. Where everything is

- Repo on Phil's Mac: ~/Projects/becarecompliant (via the device bridge: $HOME/mnt/Projects/becarecompliant).
  Edit files with device_bash (python or sed). NEVER run git through device_bash: Phil pushes.
- Supabase project: bgrtcvyjuwopunpnudeu (Be Care Compliant, London). Never touch the Join Care Now
  or Carer.Academy projects. Confirm the project id before every SQL call.
- Vercel: team ghostautomations, project becarecompliant, region lhr1. Push to main auto deploys.
  Check deploys with the Vercel tools, never assume.
- Source of truth for the plan: PHASES.md (Phase 13 section, "Phase 13, still to do"). Test lists:
  TEST-CHECKLIST-*.md. Defects: DEFECT-LOG-PHASE13.md. Claude project docs: claude/inspections/
  inspection-scoring-analysis.md, claude/legal/*, claude/new-dawn/*.
- Memory lives under /projects/01a0a40d-8d0b-7535-ad10-8b6ea9665c25/. Read phil-popup-answers.md,
  phil-test-steps-format.md, bcc-tracking-drift.md, bcc-look-at-the-artefact.md and
  bcc-framework-readiness.md before starting.
- Test companies: Bevan Care Ltd (company 84172279-54e4-4d5b-94b4-c92dc05c6baa, is_test, CIW, three
  registered branches Llanelli, Neath, Swansea) and Demo Care Company Limited (is_test). Thistle Care Ltd
  (eae26e83-1e41-472b-abc0-e2b39b907e49) is a REAL customer: read only unless Phil says go.
- Latest migration: 0377 (refuse_before_start). Next free number: 0378.

## 2. How Phil works (standing rules, learned the hard way)

- Every decision is an AskUserQuestion popup, recommended option first with "(Recommended)".
- READ HIS POPUP ANSWERS PROPERLY. A typed answer starting with a number ("1 - ...") means he picked
  that option: act on it, and answer any question he added in the same reply. Never re-ask a
  question he has answered, reworded or not. (He was rightly annoyed on 3 Oct when this happened
  three times.)
- Feedback, findings and defects in bullet points, plain English, no jargon.
- He decides when to move on. Finish the thing in hand, report, then wait.
- When he asks "why", answer why first, with evidence from the code or data, before proposing fixes.
- Verify before claiming: check the code, the database and the deploy. When he says "this worked
  before" or "we already set this rule", stop and check: he is usually right (bcc-tracking-drift).
- Look at the artefact, not just the code: a screen, a PDF, the matrix. Unit tests and typecheck
  passing proves little here.
- When a rule depends on a stored value, trace EVERY screen that reads it (record page, matrix,
  readiness, reminders, reports). On 3 Oct the record page worked out Supervision 1 on screen while the
  stored due date was never written, so a July test passed and the bug hid for months.
- Test walkthroughs: 2 or 3 steps at a time, end the turn, then ask Pass or Fail. Test now, never
  "log for later" (Final Testing is passed).
- He prefers Claude to test in the browser himself: use the Claude app's built in browser pane
  (mcp__remote-devices__Claude_Browser__*) where Phil signs in as the right user; it was more reliable
  than Claude in Chrome. Never enter passwords. One active session per user, so signing in one place
  signs out the other.
- End every piece of work with ONE push block, exactly this shape:
  rm -f ~/Projects/becarecompliant/.git/index.lock; cd ~/Projects/becarecompliant; git add -A; git commit -m "..." -m "..." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: <this session's link>"; git push; git status --porcelain
- When he types "P" he has pushed. Check the deploy, then test. Do not sit in long sleeps: check the
  deploy list, it is usually ready within 5 minutes.
- Migrations: apply with Supabase apply_migration to bgrtcvyjuwopunpnudeu AND write the numbered file
  in supabase/migrations. The connector stalls (180s timeout) on drop function, create trigger and
  long DDL: split them, and if it stalls, verify what applied, then give Phil the exact SQL with
  step by step Supabase SQL editor instructions.
- Never permanently delete data yourself: give Phil the SQL. Never change Thistle data without his go,
  and audit any one off correction in audit_log.
- No file cards in chat. No dashes in customer facing copy. Never say "item" or "board" in the UI or to
  Phil (use Record, Register, Check, Form, Evidence). Test companies send no emails or texts except
  password resets and login invites.
- External apps (Supabase, Vercel, Stripe, Resend, DNS): numbered click by click steps with exact values.

## 3. What was done recently (Phase 13, 1 to 3 Oct 2026)

- Readiness per branch (0363), creation tick list (0365), Getting set up card (0366 to 0368), refused
  saves keep what was typed, demo logins by set password link, demo housekeeping (0371, 0372).
- Inspection report research: 12 CIW and 6 CQC reports, the Cardiff PQS, CIW's framework (May 2025) and
  quality of care review guidance. Written up in the Claude project doc. Rule kept: the app shows
  evidence and never predicts a rating.
- Readiness gaps (0374 to 0376): every overdue gap labelled in CIW's words (Priority Action Notice risk,
  Area for Improvement likely, Inspector's judgement: late for a recorded reason); Add action opens
  the record's Updates over Readiness, linked to the check, with "Why is it late?" and the DBS
  application date; the manager's own rating per theme with CIW's descriptors, carried into Reg 80 and
  the pack; Safeguarding training and Social Care Wales lines; one line rows and a stacked phone layout.
- Snags S1 to S20, all built and tested (TEST-CHECKLIST-READINESS-GAPS.md, SN1 to SN23 passed). Notable:
  a recognised late reason now softens ANY check, a booking alone does not soften a non safety check;
  linked notes count from the last completion; lapsed DBS and Right to Work count in the overdue line.
- Test companies are muted (lib/email/muted.ts).
- Passing probation now saves Supervision 1's due date (it never did; Smith Tacho Azang on Thistle was
  the first ever case and was set to 13 Dec 2026 by hand, audited).
- Nothing before the start date (0377): supervision, appraisal and probation dates before the person's
  start date are refused in the app and the database. Smith's 31/12/2025 supervision (from my own 19 Sep
  monday data load) was removed by Phil.
- The Annual Appraisal Done cell now clears once the next appraisal is due (Phil's 17 Sep rule), and the
  record's appraisal box offers Complete whenever it is due.
- Company web address idea added to Additions (item 40 on the list).

## 4. Known problem, diagnosed, NOT fixed: the site is slow (Thistle complained)

- Cause: the access rules (RLS) run their "who is this user" lookups once per ROW. Measured on Thistle as
  the Registered Manager: readiness counts 398ms with RLS against 22ms without; person_check_status about
  280ms a call. Some views read every company's rows before filtering, so the Demo (50 staff) and Bevan
  slow Thistle down. The dashboard works readiness out 1 + N times. Supabase advisor: 45 auth_rls_initplan
  and 116 multiple_permissive_policies warnings. The app runs in London beside the database (not distance).
- Agreed approach (Phase 13 speed pass, not started): look the user up once per query, company first,
  one policy per action, cut the repeated app work, with a before and after row count matrix per role on
  Thistle, Bevan and the Demo, batches that can be put back, security advisor after each batch.

## 5. Still to do in Phase 13 (verify each against the code before saying it is outstanding)

1. Form builder round tests FB5 to FB9 (TEST-CHECKLIST-FORM-BUILDER-ROUND.md).
2. DEF-108 live check (Thistle Spot Check Complete button and Planner booking).
3. Deal tests D7 (rest), D8, D9 (TEST-CHECKLIST-CONTRACT.md).
4. Speed pass on the access rules (section 4).
5. Contract leftovers: 90 day read only exit, 45 day renewal reminder, retention periods by record type,
   two step sign in for Company Admins and the founder, nightly copy of stored files.
6. Inspection report review: upload a CIW, CQC or PQS report, AI checks it against the company's
   Evidence and drafts factual accuracy or challenge points (agree scope by popup first).
7. Safety Checks department, Maintenance department, Manager sign off (scope talks first).
8. Phase close: a month of real Thistle use with no new High or Medium defect in the last fortnight,
   Thistle's manager preferring it, a real testimonial (or remove the homepage band), and Business to
   Pro proved on a real Stripe subscription.

## 6. YOUR FIRST TASK: a full security and bug audit, Phase 0 to Phase 13. READ ONLY.

Make NO changes of any kind: no code edits, no migrations, no data updates, no pushes. Phil wants to
see everything found before anything is touched. Ask him by popup before starting only if something
in this brief is unclear; otherwise start.

Cover at least:

Security
- Every table: RLS on, policies per role (Founder, Company Admin, Responsible Individual, Registered
  Manager, Manager, Supervisor, Senior, On Call, Team Member, Viewer). Prove tenant isolation and role
  limits with rolled back impersonation queries (set local role authenticated plus request.jwt.claims),
  never with writes that stay. Service User data is special category: check Team Members and other
  roles cannot read it unless assigned.
- Every SECURITY DEFINER function: search_path pinned, internal authorisation, guards by record
  ownership not just company membership, EXECUTE not granted to anon unless intended.
- Service role client never imported into client components; no secrets in NEXT_PUBLIC_ variables.
- Webhooks (Stripe, Twilio, Resend) verify signatures; crons fail closed without CRON_SECRET; webhook
  paths in middleware PUBLIC_PATHS and nothing else public that should not be.
- Storage buckets private, short lived signed URLs, downloads audited.
- Single session login enforced server side; support mode cannot write; whistleblowing hidden from the
  founder; audit logging on reads of Service User records.
- Supabase security advisor; Vercel runtime errors and logs for the last 14 days.

Bugs and data integrity
- Typecheck and the full unit test run (node --experimental-strip-types --test 'lib/**/*.test.ts').
- Read only data checks across every company: checks with impossible dates, completions before start
  dates, overdue counts that disagree between screens, undated recurring checks that should be dated,
  orphaned rows, duplicate people, leavers or archived records still counted, stuck notifications,
  evidence without files, invoices that do not add up.
- Walk the main flows on Bevan in the Claude browser pane (Phil signs in): add a person, complete each
  check type, paper upload, probation, holiday, absence, complaints, incidents, planner, readiness,
  reports and PDFs, invoicing, settings. Look at the screens and the PDFs, not just the code.
- Re-check the standing rules in code: no "item" or "board" in UI text, no dashes in customer copy,
  canonical form controls, refused saves keep typed data, Save button behaviour.

Report
- Write the findings to AUDIT-2026-10.md in the repo and the Claude project (claude/audits/), grouped
  Security / Bugs / Data / Standing rules, each finding with severity (High, Medium, Low), where it is,
  how you proved it, and what the fix would be. Do not fix anything.
- Then give Phil a short bullet summary in chat, highest severity first, and ask by popup which to fix
  first. Wait for his answer.
