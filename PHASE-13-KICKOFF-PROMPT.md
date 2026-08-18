# Be Care Compliant — Phase 13 kickoff: Operation Thistle (paste this into a new chat)

We are continuing **Be Care Compliant (BCC)**, the commercial multi-tenant SaaS that keeps UK care companies inspection-ready for CQC (England) and CIW (Wales) and their local authorities. It is a live project deployed on Vercel at **www.becarecompliant.com**. Stack: Next.js 15 App Router + TypeScript + Supabase (Postgres, RLS, Storage, Auth) + Tailwind v4.

**Phases 0 through 11 are COMPLETE and deployed.** Final Testing (Phase 11) passed: UI/UX and a security & permissions audit both returned GO for soft launch, and the follow-up security hardening is done and live — nonce-based CSP (enforcing), public-form rate limiting, export role-gates, email escaping, Stripe webhook idempotency, Supabase leaked-password protection, and a live file-isolation proof (cross-tenant fetch 404, signed-URL expiry, private bucket). Findings are in `QA-REPORT-SECURITY.md` and `QA-REPORT-UIUX.md`.

**We are now starting Phase 13 — Operation Thistle.** Ordering matters: **Phase 12 (Marketing & Launch) is HELD until after Phase 13** (Phil, 2026-08-18) — we prove the product on a real agency before spending on a public launch. So the order of work is 13, then 12, then 14 (Operation New Dawn / eMAR).

## What Phase 13 is

**Stand up the REAL Thistle Care Ltd from scratch on the live product, run it, and fix every defect that real use exposes — before a single paying customer arrives.** Everything so far was tested against **Acme**, a company built for testing by the two people who built the product. A working agency will do things nobody thought to try: a spreadsheet with a column we never imagined, a carer in two branches, a leaver un-leaved, a supervision cycle that straddles a rename. Learning that from a paying customer costs a refund and a reputation. Thistle is the last chance to be wrong cheaply.

### THE GOVERNING RULE (Phil): every fix and every change is for ALL companies, not just Thistle.

When Thistle exposes a defect you fix the PRODUCT — the shared codebase, or the shared schema via a migration — so every tenant benefits. You do NOT patch Thistle's data and you do NOT special-case Thistle in code. If something can only be put right with a hand-written SQL update to one company's rows, that is a defect in the product (the import, the flow, a missing control), not a data problem — find and fix the cause so it never recurs for anyone. And **look at the artefact, not the code**: judge every fix by what appears on the real screen for a real user, not by what the code says should happen.

**Do NOT start coding or provisioning yet.** Read, verify, then agree the scope and order with me by ONE popup before doing anything.

## First, orient yourself (before proposing anything)

1. Read **`PHASES.md`** (the master plan and source of truth) — especially the **"Phase 13 — Thistle Care live"** section, the **"The three operations"** table near the top, and the 2026-08-18 decision holding Phase 12 until after Phase 13. Then read **`QA-REPORT-SECURITY.md`** and **`QA-REPORT-UIUX.md`** so you know what Final Testing proved and what was deferred.
2. Read the project memory — **`MEMORY.md`** and the `bcc-*` notes it links (project state, permission boundaries, brand/UX decisions, the seed-checks NULL gotcha, the form-renderer hook bug, sandbox limits, and the notifications / billing / reporting notes), including `bcc-look-at-the-artefact`. These carry decisions and corrections you must not relearn.
3. **Confirm the Supabase project before any SQL.** It is **becarecompliant**, ref **`bgrtcvyjuwopunpnudeu`**, region eu-west-2 (London). NEVER run BCC SQL against `joincarenow` or `carer-academy`. Verify the target on every apply. The service-role client needs the **`sb_secret_`** key on this project's API-key system (the publishable/anon key gives "User not allowed" 403s).
4. **Latest migration is `0208`; the next new migration is `0209`.** Every schema change is applied through the Supabase MCP to `bgrtcvyjuwopunpnudeu` AND written as a numbered SQL file in `supabase/migrations/`, so the repo stays the source of truth.
5. Existing tenants: **Acme Care Company** (Pro) and **Bevan Care Ltd** (Business) are the test companies. **Thistle Care Ltd is the real agency** this phase provisions.

## Phase 13 scope (agree the slice and order by ONE popup first)

From `PHASES.md`, already specified — confirm before starting:

- **A real tenant, provisioned properly** through the founder console, on the tier Thistle would actually buy, with its own branches, forms and register columns. NOT a copy of Acme.
- **Real data in** — their staff, service users, training history and policies, through the import paths a customer would use. The import IS the test.
- **Real people using it** — managers on the register and the Planner, carers on the Team Member area, briefings and policies actually signed, an inspection-readiness run Thistle would show CIW.
- **A defect log kept as it happens** (artefact, not code) — every defect fixed as a PRODUCT fix for all companies.
- **Billing exercised for real** on Thistle's tier, including a branch change and a seat change. **Thistle starts as a PAYING customer, then moves to Black (free) after the shakedown** — an invoice makes both sides serious and exercises the real billing path a customer takes.
- **THE KNOWN GAP, which is Phase 13 scope, not a nice-to-have: a company's tier cannot be changed anywhere.** `companies.tier` is written at creation / trial provisioning and by nothing else, so no Business customer can upgrade to Pro, nothing cancels Stripe on a move, and the webhook copies `billed_tier` FROM the tier (Stripe is downstream of the app). Changing tier must do the whole job: move the tier, settle Stripe (cancel, or switch the base price and prorate), write an audit entry, and decide what happens to seats/branches that fall outside the new allowance.
- **A real testimonial**, taken once Thistle has genuinely run on it — or the homepage social-proof band comes off.
- **Exit criteria agreed up front**: a period of ordinary use with no new defect above an agreed severity, and Thistle's own manager saying they would rather use it than what they use now.

Open decisions to settle with me by popup: whether Thistle's data lives in the SAME Supabase project as the demo/test companies (it should — otherwise the thing being tested is not the thing being sold), and what happens to Acme once Thistle is real.

## How we run a phase (follow exactly)

- Before anything, ONE **`AskUserQuestion`** popup to agree the Phase 13 scope slice and order (recommended option first, labelled "(Recommended)"). All decisions to me are popups, never loose questions in chat.
- Keep a task list current (a **Phases** box and a **Phase Progress** box for this round) and mirror progress into `PHASES.md` as dated entries, without me asking.
- **Anything I must run locally = EXACTLY ONE copy-paste terminal block**, semicolons not `&&`: `cd "<repo>"; git add -A; git commit -m "..."; git push origin main`. Never prose steps, never multiple blocks.
- **Before EVERY terminal block, run `npx tsc --noEmit` and `npm test` on the device** and only hand it over when both are clean. The sandbox cannot reliably build; the Vercel build is the real compile gate, so write carefully.
- Vercel auto-deploys on push. **Verify the deploy is Ready (Vercel MCP) and migrations are applied before asking me to re-test anything.**
- Anything in an external app (Stripe, Supabase dashboard, Resend, Twilio, DNS) = a numbered, click-by-click walkthrough with the exact values.
- **Feedback to me in BULLET POINTS, not prose. I decide when a piece of work is done and when we move on** — do not roll ahead on your own.
- **Terminology, always: Record / Register / Check / Form / Evidence. Never "item" or "board."**
- **Do NOT put file cards in chat.** Write repo files with the device shell (a python heredoc), never SendUserFile.

## Standing rules and mistakes already corrected — do NOT repeat these

- **Migrations** go through the Supabase MCP to ref `bgrtcvyjuwopunpnudeu` ONLY (verify first) AND as a numbered SQL file in `supabase/migrations/` (next `0209`). Never touch `joincarenow` or `carer-academy`.
- **Never `redirect()` from a Server Action to a URL with a query string** (Next.js #78396 / React #310, "Rendered more hooks than during the previous render"). Return `redirectTo` and `router.replace` it client-side (the `ActionState` pattern in `lib/forms.ts`). A query-less redirect (e.g. `/dashboard`) is fine.
- **`"use server"` files export ONLY async functions** — types/consts belong in `lib/`. tsc will not catch this; `next build` will.
- **Supabase nested to-one relations infer as ARRAYS in TS** — cast `as unknown as T[]`. **A keyed `Record<K, ...>` cannot be indexed by a plain `string`** — use a safe accessor or cast. **An all-NULL column in a `VALUES (...)` list is typed `text`** and clashes with a typed target column — cast such NULLs (`null::int`). **Remove unused imports/vars before committing** (the build warns or fails and you cannot lint in the sandbox).
- **Do NOT use bash `git` or `grep` on the iCloud repo — it hangs.** Read and edit with targeted device reads (single-file `sed` / `cat` / python, or the file/list tools), never a recursive `git` / `grep` / `find` over the repo root. To search doc contents, stage the file(s) into the cloud container and grep the copies there.
- **Live testing is done in Chrome (Claude in Chrome)**; DB proof through the Supabase MCP by impersonating a role inside a ROLLED-BACK transaction (`begin; set local role authenticated; set local request.jwt.claims = '{"sub":"<profile-id>","role":"authenticated"}'; <queries>; rollback;`); runtime and HTTP status through the Vercel MCP logs. Never claim a status you have not seen.
- **"Done" means traced, not typechecked.** Verify against the real artefact — the screen, the DB row, the Vercel log — not against what the code should do.

**The point of Phase 13:** a real agency uses BCC in anger, we fix everything it exposes as product fixes for every company, we get an exit-criteria sign-off, and only then do we move to Phase 12 (Marketing & Launch). Fix the product, not the tenant.
