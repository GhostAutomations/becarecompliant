# Be Care Compliant

Multi tenant SaaS that keeps UK care companies compliant with their regulators (CQC in England, CIW
in Wales) and local authorities. The founder is Phil: not a developer, works point and click,
wants plain English. Sister products Join Care Now and Carer.Academy are separate code and data:
never mix the repos or the databases.

## Projects: never touch anything else

- Supabase: `bgrtcvyjuwopunpnudeu` (becarecompliant, London). NEVER `afwfutlwuhqzdihwsibr`
  (joincarenow) or `bamokbdtlzllbrsdxywp` (carer-academy). A hook in `.claude/hooks/` blocks any
  Supabase tool call aimed at another project.
- Vercel: project `prj_eGEI0ICcSHIIKWc4qR29XaBjk6Aa`, team `team_96YpBBhKikgVGZXKMGz725mJ`.
  Deploys automatically on push to `main` (region lhr1).
- GitHub: `GhostAutomations/becarecompliant` (private).
- Code lives in this folder. Non code documents (reports, registers, imports, prompts, legal
  drafts) live in `~/Projects/BCC Documents`. Never read or write the iCloud "Be Care Compliant"
  folder.
- Companies in the database:
  - Thistle Care Ltd: the real, live customer (Wales, CIW, branches Cardiff and Newport). Read only
    for tests; any change to its data needs Phil's go.
  - Bevan Care Ltd: Phil's test company. All test writes go here. Test companies send no emails
    or texts at all, except login invites and password resets.
  - Demo Care Company Limited: the demo logins (also a test company).
  - Acme Care Company, named in older decisions, was the test company before Bevan. It has been
    deleted.

## Stack (fixed)

Next.js 15 App Router, TypeScript, Supabase (Postgres, RLS, Storage, Realtime, Auth), Tailwind v4,
Vercel. Stripe, Resend, Twilio, Anthropic, Microsoft Graph (cloud drive copies). Never add a
framework, component library, ORM or service without asking Phil first.

- `npm run typecheck` (tsc --noEmit)
- `npm test` (node --test over `lib/**/*.test.ts`, no path aliases, so tested logic stays in
  importless modules)
- `npm run build` (catches what tsc misses, such as a "use server" file exporting a non async
  value)

## Vocabulary (hard rule)

Never write the words "item" or "board" in our copy, code identifiers, comments or chat. Whole
words only: "Dashboard" is fine, and "Whiteboard" (the Planner page name) is agreed. Third party API
fields (Stripe subscription items) are unavoidable where we call them; never rename an existing
identifier without asking. Our words:

- Record: one person or one service user
- Register: the records of a branch (the People register, the Service User register)
- Check: a recurring compliance requirement on a record
- Form: the document completed to satisfy a check
- Evidence: a completed, stored form, immutable

People (staff) and Service Users (clients) always stay distinct. "Founder" is Phil (platform admin);
"Admin" is the Company Admin role. Confirm any new vocabulary with Phil before it ships.

## How Phil works (standing rules)

- Every question to Phil is an AskUserQuestion popup, recommended option first with
  "(Recommended)" on the label. Never loose questions in chat.
- A typed popup answer IS his answer. "1 - ..." means option 1. Never re-ask a question he has
  answered, reworded or not; answer any question he adds in the same reply.
- Phil decides when to move on: finish the work in hand, report, then wait. Exception: when he
  marks a test Pass, carry straight on to the next agreed fix.
- His corrections are permanent. Never reintroduce something he rejected. When he makes a new
  standing decision, write it into the matching `docs/decisions` file (or a new one, listed in
  `docs/decisions/README.md`) in the same session. The repo is the record, not auto memory.
- Feedback, reviews and findings go in bullet points.
- A new idea mid phase: popup asking whether it goes in the current phase or is parked (THE LIST,
  `docs/decisions/the-list.md`, or Phase 14 for New Dawn ideas), with your recommendation first.
- "The list" or "our list": show the open entries of `docs/decisions/the-list.md` with their
  numbers, done ones left out. Never renumber; new entries go on the end.
- UI change requests: restate what the result will look like (size, placement, density) and check
  it against his stated goal before building.
- Anything Phil must do in an external app (Vercel, Supabase dashboard, Stripe, Resend, Twilio,
  Microsoft, DNS): numbered steps, exactly what to click and paste, what success looks like, what
  to check if it fails.
- If Phil must run something himself, give exactly one copy paste block. SQL and one off commands
  go inline in chat, never as files.
- Look up present day facts and cite them (regulations, prices, third party behaviour). Never quote
  them from training data.
- Don't build or suggest integrations (Join Care Now, Carer.Academy, rostering, eMAR) until Phil
  asks. When he does, read `docs/decisions/suite-handover.md`.
- Plain English, concise. When done: what changed, what was checked, what is still untested.
- Push shorthands, read for the new flow: "P&C" means push anything unpushed (Phil approves), then
  confirm the commit is on main and the production deploy is READY. "PT" means the same, then run
  the tests yourself in Phil's Chrome. "PC" means the same, then carry on with the next agreed work.

## Testing

- Test now, in the same piece of work. Final Testing (Phase 11) is passed, so nothing is logged
  there any more. A check marked Not tested stays open until it has been tested.
- Checklists live in `TEST-CHECKLIST-<AREA>.md`. Each check runs as a popup: Pass, Fail, Not tested.
- When Phil runs a test himself: give 2 or 3 numbered steps in chat (popups show no line breaks),
  then END THE TURN and wait. Ask Pass or Fail only after he has done them.
- If a popup answer is a question or confusion, stop the test and walk him through it. "Talk me
  through it" means HE presses the buttons; you touch nothing.
- Prefer tests you can run yourself: database queries, Vercel checks, Chrome. Never enter
  passwords or sign in as anyone; Phil signs in.
- Never ask Phil to test until the deploy is READY and its migrations are applied.
- Details: `docs/process/test-steps-format.md`, `docs/process/help-requests-during-testing.md`.

## Deploying

1. `npm run typecheck`, `npm test` and `npm run build` pass.
2. Commit with a clear message. Push only after Phil approves the push prompt.
3. Check the Vercel deploy reaches READY with the Vercel tools; read build and runtime errors if
   it doesn't.

Migrations: a numbered file `supabase/migrations/NNNN_name.sql` (the next number after the highest),
applied to `bgrtcvyjuwopunpnudeu` only, after checking the project. Apply it, and pass the security
advisor, before pushing code that needs it; keep it compatible with the code already live. Stop if
the advisor shows any ERROR; judge only new WARN and INFO lints. If applying through the Supabase
tools is refused, give Phil the SQL inline with numbered steps for the Supabase SQL editor.

A task or phase is marked done in PHASES.md only after its tests pass and Phil confirms.

## Done means traced

- Search the codebase before building. Extend what exists; never build a parallel version. Shared
  helpers include the auth guards (`lib/auth/guards.ts`), the notification sender, the PDF and CSV
  export helpers, the form renderer and the cloud copy queue.
- Trace every entry point, mutation site and piece of state before saying done. Never "that should
  work now" for a path you haven't traced. If a fix fails Phil's test, re-trace from the symptom.
- Verify, don't guess: when Phil reports a fault, first check the deploy is READY, the migration is
  applied, and the build and runtime errors. If a system can't be reached, ask him for one
  specific signal.
- Look at the artefact, not the code: render the PDF and look at it, read the rows behind a number,
  read the third party's own screen, see a screen as the role it is for, list storage after a
  delete. See `docs/process/look-at-the-artefact.md`.
- Before saying something is still to build, check the code; PHASES.md and notes lag behind
  (`docs/process/tracking-drift.md`). Log finished work in PHASES.md in the same session.
- "All companies" includes future companies: change the `seed_company_*` functions too, and move
  existing companies only where rows are still exactly as seeded
  (`docs/process/all-companies-means-the-seed.md`).

## Quality bar

- Validation and visible errors; no silent failures. A job, email or text that can quietly not run
  (a missing env var) shows its state in the UI, and Phil is told about the dependency.
- Idempotent: running anything twice never duplicates checks or Evidence.
- Edge cases at build time: an empty state on every screen; done is never outstanding; archived
  records, leavers and discharged service users are left out of registers, reminders, rollups and
  reports. Staff on maternity leave or long term sick, and service users in hospital, still count.
- Dates in Europe/London; test month ends, leap years and the clock change.
- A refused save never wipes what was typed.
- No dashes as punctuation in customer copy (screens, emails, PDFs, letters, marketing).

## Security (enforced in the database, not just the UI)

- Every tenant table carries company_id (and branch_id where relevant), isolated by RLS through the
  helper functions.
- Privileged writes go through SECURITY DEFINER RPCs with search_path pinned and checks inside. The
  caller's auth.uid() still applies, so guard by record ownership, not just company membership.
- Role limits live in RLS and the UI. Confirm any new permission edge with Phil before building it
  (`docs/decisions/permission-boundaries.md`).
- Tier and feature gating is enforced server side; seat counting is exact; accounts are invite
  only, never public sign up (`docs/decisions/stripe-prices.md`, `seats-and-trials.md`).
- One desktop and one mobile session per user, enforced server side (`claim_session`); the
  displaced device is told it was signed in elsewhere.
- Secrets stay server side, never NEXT_PUBLIC_. The service role client never appears in a client
  component. Never read `.env` files.
- Webhooks verify signatures and crons fail closed without their secret; webhook paths go in the
  middleware PUBLIC_PATHS.
- Private storage, short lived signed URLs, downloads audit logged.
- Branches are never deleted: their foreign keys cascade Regulation 73 and 80 records. Prove risky
  database work inside `begin; ... rollback;` first.

## GDPR

Each customer company is the controller; Be Care Compliant is the processor. Service User data is
special category health data: strict tenant and role isolation, audit logging on access as well as
change, retention and deletion designed in, no data selling. Flag the GDPR impact of any change
that touches personal data. Never put real staff or service user names into code, comments, tests
or docs.

## Progress tracking

PHASES.md is the plan and the work log. It is very large: search it, don't read it whole.
Operation Launch (phases 0 to 12) is done, Operation Thistle (phase 13) is current, Operation New
Dawn (phase 14 on) comes after Thistle signs off. Keep the task list in step with it: where we are
in the phases, and the current work's tasks ticked off as they finish.

## Where things are

- `docs/decisions/README.md`: every standing decision by area. Read the matching file before
  changing an area.
- `docs/process/`: how Phil wants work done. `docs/project/`: plans (cloud drive, New Dawn).
- `.claude/rules/`: rules that load when you touch screens, server code or customer copy.
- `AUDIT-2026-10.md` (repo root): the October security and bug audit and its fixes.
- `~/Projects/BCC Documents`: the speed plan, legal drafts, inspection scoring analysis.
