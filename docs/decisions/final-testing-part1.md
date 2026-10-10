# Final testing part1

> Final Testing Part 1 (UI/UX + functional sweep) COMPLETE 17 Aug 2026: all six roles swept, 15 fixes in 3 batches, verdict GO for soft launch. Read for what was verified, the open non-blocking findings awaiting Phil, and the two tiny carried-forward checks

Run 17 Aug 2026 evening, COMPLETE. QA-REPORT-UIUX.md in the repo is the authoritative
findings log; its verdict: **GO for soft launch on UI/UX grounds**. PHASES.md Phase 11
carries the dated summary entry. Part 2 (security) is a separate chat, not started.

## How the run worked (keep for next time)

Chrome driven by Claude on the LIVE app as each role; Phil signed in at each switch
(Claude never types passwords). Fixes batched; Phil pasted ONE terminal block per batch;
Vercel verified Ready; every fix re-tested in the browser. Repo edits via device_bash
python heredocs. **NEW RULE proven this run: `npx tsc --noEmit` runs on the device inside
45s — run it plus npm test before EVERY handover block** (batch 2 shipped a syntax error
inside a multi-line import that npm test cannot see and Phil's semicolon block pushed
anyway → red Vercel deploy, repaired same evening; details in `cowork-sandbox-limits` (not carried over)
point 5).

## What was swept (all PASSED, detail in the report)

Founder console incl. manage-as (30-min auto-expiry observed lapsing — Phase 9 leftover
CLOSED), marketing pages, the whole Admin surface as the test Company Admin (compliance loop exact: due
+30d, RAG flip, named banner), the test Branch Manager (branch scoping of the dashboard
CLEARED — the deferred item), the test carer's /my portal (guards + phone), Sam the Supervisor
(FIRST visual pass of the role), Rhian the RI (Whistleblowing opens; holiday approval
EXERCISED LIVE — audit row holiday.decided/registered_individual). Desktop + 390px.

## The fifteen fixes (three batches)

Batch 1 (verified live): founder Companies list revenue ignored branches (£69 vs £76.50,
fifth surface of the class — now on subscriptionMonthlyPence); branded 404; canonical
ROLE_LABELS on the founder company page; back-link caps.

Batch 2 (verified live after a repair — see the tsc rule above): year-0026 guard at three
layers + unit tests (lib/date-plausible.ts 1900-2100; cause: Chrome date control turns a
typed 2-digit year into literal 0026, one reached a live card as "Back at work 19 Feb
0026"; the stored holiday dates were clean — the garbage was an evidence answer);
evidence audit actorRole no longer hardcoded "unknown"; dashboard score card 1280px
breakpoint xl→2xl; RTW Limits save back to gold; founder branch Remove used NONEXISTENT
btn-secondary class (rendered as bare text) → btn-outline; invoicing ISO dates → ukDate;
Closed-incidents cross-link; migration 0208 (support mode reads credit balances).

Batch 3 (pushed end of session): supervisor dashboard no longer claims "Inspection
Readiness / On Call is not switched on for this company" when the ROLE simply cannot see
them — score card copy is role-aware, On Call panel hidden below manager level.

## Open findings, none blocking (decisions for Phil, all in the report)

Invite Role dropdown lacks Admin (0150 fixed the backend only); branch required on
invites for company-wide roles; SU register lands on first branch, no All option; date
STYLE mixed (written month vs slashes, sometimes same page); below-manager dashboards
show n/a tiles whose links bounce; "Active users (7)" counts invited accounts; Settings
hidden from the RI entirely; PQS tile labels truncate at 1280; on-call urgent rows carry
no distinguishing text; invite allowlist entry thistlecarewales.co.uk was REMOVED during
the run (left off deliberately).

## Carried forward (logged in PHASES.md Phase 11)

1. 30-second Sam login after the batch 3 deploy to see the corrected copy (offered to
   Phil at session end; if he declined it stays logged).
2. Founder branch Remove button re-render as founder (batch 2 class fix).
3. Part 2 security question: can a booked conductor complete a check they were NOT
   booked for on an other-branch person? Buttons render; the RPC guard is the question.

## Fixtures state after the run

Acme users now SEVEN active: + Sam Supervisor (a supervisor test login) (Newport1)
and Rhian Responsible (an RI test login) (Office) — keep for future role testing.
Seats 4 of 6, no seat billing line (seat maths verified). the test carer's holiday request is
now APPROVED (fixture consumed with Phil's OK). New evidence: one Spot Check on a test carer record (17 Aug, "QA sweep (Claude)", Satisfactory) — also proved Planner auto-complete.

Related: [the-list](the-list.md) [look-at-the-artefact](../process/look-at-the-artefact.md) [save-button-behaviour](save-button-behaviour.md)
[project-state](project-state.md) `cowork-sandbox-limits` (not carried over) [permission-boundaries](permission-boundaries.md)
