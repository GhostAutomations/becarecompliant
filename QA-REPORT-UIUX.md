# QA REPORT: UI/UX + Functional Sweep (Final Testing Part 1)

Run started 17 August 2026, live production app (www.becarecompliant.com), Chrome driven
by Claude with Phil at the keyboard for logins. Role by role, desktop and phone width.
Severity: Critical / High / Medium / Low. Every finding verified on the rendered page,
not inferred from code.

Companion: security sweep is Part 2, a separate chat. Anything alarming spotted here is
flagged to Phil and parked for Part 2 rather than dug into.

## Verdict

PENDING: sweep in progress.

## Findings

### Founder console (swept 17 Aug, desktop + 390px)

- FIXED+VERIFIED LIVE (High, batch 1) Companies list page quoted "Committed monthly revenue
  £69.00/mo" and per-card "Monthly £69.00/mo": computed base + seats by hand instead of
  the shared subscriptionMonthlyPence rule, so it ignored the £7.50 branch. The FIFTH
  surface with this defect class. Now on the shared rule, with an "Extra branches" line
  on each card. Console tile, Revenue page and drill-in were already correct (£76.50).
- FIXED+VERIFIED LIVE (Medium, batch 1) No custom 404: any bad address rendered the raw black
  Next.js "404 / This page could not be found." Added branded app/not-found.tsx.
- FIXED+VERIFIED LIVE (Medium, batch 1) Founder company drill-in had its own stale ROLE_LABELS map:
  `staff` rendered as raw lowercase "staff", team_member as "Team Member" where the
  canonical map (lib/nav) says "Viewer". Now imports the canonical map.
- FIXED+VERIFIED LIVE (Low, batch 1) "Back to founder console" vs "Back to Founder console":
  audit + trial-requests pages disagreed with the other five. All capital F now.
- FIXED+VERIFIED LIVE (Medium) Support mode (manage-as) dashboard showed "n/a" for
  SMS Left and AI credits Left where the real Admin sees 350/176. cac_select /
  csc_select RLS granted is_company_member only; every other tenant table also grants
  is_platform_admin (whistleblowing excepted BY DESIGN, 0177). Migration 0208 applied
  and verified in a live support session (350 Left renders).
- FIXED (Low, batch 2) Audit rows for evidence.created carry actor role "unknown":
  lib/evidence/submit.ts hardcoded actorRole "unknown" and its profile select never
  fetched role. Fixed; applies to new rows only (historic Acme rows stay as written,
  the trail is append only).
- NOTE Training templates page (founder): per-row Save renders muted (check it is a
  disabled gold, not an outline base) and "Delete template" is floating red text rather
  than a button. Founder-only screen; polish, not blocking.
- PASS Manage-as: banner, "Support session: Acme Care Company" greeting, Exit, and the
  30-minute auto-expiry was observed lapsing naturally this session (the Phase 9
  Final Testing leftover). Revenue page, Usage page, Platform health (price guard all
  "Matches" / "Stripe agrees"), Trial requests empty state, Form template library,
  Question bank empty state, Audit console filters render correctly. Founder pages
  stack cleanly at 390px with the bottom dock nav.

- FIXED (Medium, batch 2) Compliance score card at 1280px (13 inch MacBook): the
  xl:col-span-2 gave it ~200px, the ring sat over the words and every line broke.
  Breakpoint moved xl to 2xl so laptops keep the third column; big monitors unchanged.
  (Phil tuned this card the same morning; the change is additive to his rule, seen at
  a width his monitor does not hit.)

### Process note (17 Aug, batch 2 red deploy)

- Batch 2's first push FAILED on Vercel: an inserted import landed inside a
  multi-line import in lib/form-validate.ts. npm test cannot catch this (the file
  is deliberately never imported by tests) and the semicolon terminal block pushes
  even when the local build fails. Repaired same evening. NEW RULE: npx tsc
  --noEmit runs on Phil's machine in seconds and is now run before every handover
  block, so a parse or type error can never reach Vercel again.

### Marketing site (public pages, swept 17 Aug)

- PASS Homepage, pricing page copy and numbers: £49/£69 plus VAT, £7.50 branch, £5
  user, 100 AI credits £10, trial wording, UK tone, no banned terminology.
- PASS (was a false alarm) Homepage topbar said "Dashboard" while /pricing said
  "Sign in" minutes apart. Re-tested with a stable founder login: /pricing shows
  Dashboard. The earlier read caught the sign-out gap between Akram and the founder.

### Company Admin (Acme, navy crisp theme, swept 17 Aug evening)

- FIXED (Medium, batch 2) "Back at work 19 Feb 0026" on the Holiday page: Chrome's
  date control turns a typed two-digit year into the literal year 0026; a July
  holiday submission stored one in immutable Evidence and the card repeated it.
  Three layers now refuse it: validateAnswers rejects years outside 1900-2100
  (new lib/date-plausible, unit tested), the date control carries min/max, and the
  holiday card refuses to print an implausible stored year (falls back to nothing).
- FIXED (Low, batch 2) RTW "Limits" save button on the person record overrode
  ActionForm with btn-outline: the standing rule says every save is gold
  btn-primary. Override removed.
- FIXED (Low, batch 2) Founder branch "Remove" used btn-secondary, a class that
  does not exist, so it rendered as bare text. Now btn-outline per the
  destructive-actions-look-like-buttons rule.
- PASS Compliance loop end to end (Spot Check on a live record): instant
  "Saving...", client redirect, named confirmation banner ("Spot Check completed.
  Evidence stored and the next due date scheduled."), record pill flipped
  Overdue to Compliant, next due advanced exactly 30 days.
- PASS People register: branch filter (URL param), view switcher (Matrix /
  Compliance / Leavers / LTS & Mat Leave / Archive), search, surname ordering,
  sticky carer column, permanent horizontal scrollbar, Leavers empty state.
- PASS Holiday page (approve controls, calendar, pending/booked groups) and
  Absence page (Return to Work list, stage cards, Bradford figures) structurally.
- PASS On Call rota + call log (UK dates, urgent pills, empty rota grid).
- NOTE (Low) Date STYLE is inconsistent between sibling screens: Absence prints
  "Off 13/10/2026", Holiday prints "01 Sep 2026", On Call prints "PM: 25/07/2026".
  All UK, three styles. Worth unifying on the written-month ukDate style.
- NOTE (Low) Dashboard "On call: urgent follow ups" shows four visually identical
  rows ("Urgent - PM: 25/07/2026"); the rows carry no hint of WHAT the follow-up
  is. Suggest a snippet of the follow-up note per row.
- NOTE (Low) PQS panel tile labels truncate at 1280px ("Social Care Wales r...",
  "Customer satisfacti...").
- RETRACTED The dashboard Planner tile showing per-day "Clear" plus the
  "Nothing booked this week" footer is deliberate (documented in the code).
- FIXED (Low, batch 2) Invoicing table printed raw ISO dates (2026-08-10) in
  Issued and Due. Now ukDate. The item 27 leak class, as predicted.
- FIXED (Low, batch 2) Closed incidents looked unreachable: the open register
  never mentioned the Closed page (nav drawer child only), while Whistleblowing
  offers Closed in its filter. Added a Closed/Open incidents cross-link beside
  the filters.
- PASS Settings hub + Billing (plan, AI 176, SMS 350 with the hard-stop copy),
  Data retention (rule prose, tiles, hold panel, honest footer), Notifications
  (channels, honest "SMS not configured yet" note, per-row phone saves),
  Users and invites (allowlist remove verified live, two invites sent with
  Sending state, named confirmation, cleared form, pending list updates).
- PASS Reports hub, Inspection Readiness, Briefings (empty outstanding state),
  My Planner (overdue band capped at 4 + Show more, calendar chips, gold =
  your own), Invoicing register, Complaints register, Whistleblowing register
  (confidentiality note, Closed in filter).
- PASS Evidence read-through on the fresh Spot Check: header attribution,
  written-month body dates, "Not answered" for empty optionals, outcome
  round-tripped, immutability note. Planner booking auto-completed when its
  check was completed (record panel now says "Nothing booked in").
- PASS Phone width (390px): dashboard, People register, person record, Holiday
  page all stack cleanly with the bottom dock nav; big tap targets; matrix
  scrolls horizontally with the sticky carer column.
- FINDING (Medium, needs Phil) The invite Role dropdown has no Admin option, so
  an Admin cannot invite another Admin from the UI. 0150 fixed the backend for
  exactly this; the select never gained the option. Confirm intended roles then
  add it (or record why not).
- FINDING (Low, needs Phil) Branch is required on the invite form even for the
  company-wide roles (RI and RM ignore branch scope), and the refusal is the
  native browser bubble rather than the app's styled error.
- NOTE (Low) Users page "Active users (7)" section mixes truly active accounts
  with invited-never-accepted ones tagged lowercase "invited"; the founder page
  counts "Active users 2". Same words, different meanings.
- NOTE (Low) Service Users register has no All-branches option (People has one)
  and lands on the alphabetically first branch, so an Admin's first sight of
  the register is one branch that looks like everything.
- NOTE (Low) Evidence page header prints 17/08/2026, 21:33 beside a body
  printing 17 August 2026 (the date-style inconsistency again).

### Manager (Tim Mingle, Cardiff1 + Newport1)

- Sweep pending.

### Care Worker (Charlotte, /my portal)

- Sweep pending.

### Cross-cutting

- Sweep pending: save buttons, dropdowns, modals, back navigation, empty states,
  UK dates, terminology, error pages, keyboard/a11y light pass.
