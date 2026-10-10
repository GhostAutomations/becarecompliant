# The list

> THE LIST — Phil's running to-do for BCC Additions. When he asks for \"the list\" in chat, show THIS, verbatim, with done items struck through.

**Phil's instruction, 2026-07-27: "when i ask for the list in this chat, show me this
list, once the items are done, keep them on the list but strike through the text."**

- [stated] 2026-09-29, asked for "our list": "only show me things outstanding". Show only open items (keep their numbers); leave done items out of what is shown.

Never drop an item, never renumber. Completed items stay, wrapped in ~~strike~~. Show as
numbered bullets. Add new items to the end as they are agreed.

## The list

1. ~~**Return to Work form v2**~~ **DONE 2026-07-29.** Grew: questions fully AI tailored
   per absence (0147/0148), Team Members and Viewers out of the conducted by list (0146),
   signature bug found and fixed, signature drawn on the PDF.
2. ~~**Email domain allowlist**~~ **DONE 2026-07-29** (0149). Opt in, off by default,
   applies ONLY to invites typed by an Admin on Settings > Users; the automatic Team
   Member path structurally cannot reach it. Subdomains count; bare public endings
   refused. Resending a pre-existing invite deliberately not gated. Tested, all pass.
3. **Stripe AI credit top up** — three fixed one off packs. Needs Phil's decision on the
   price points before any Stripe products get wired. **Analysis done 2026-08-14**: across 36
   real calls the average action is 570 input + 861 output tokens ≈ **1.1p at Sonnet 5
   standard rates** (Reg 80, the heaviest, ~3p). At the existing £10/100 credits that is ~9x
   cost, so pack sizing is a psychology question, not a cost one. Proposed and NOT yet agreed:
   100/£10, 300/£25, 750/£50. Blocked on which model `ANTHROPIC_MODEL` actually runs (blank in
   `.env.example`; the cost swings fivefold). **Related defect: `cost_pence_sum` is null on
   every AI usage row ever recorded, and the founder usage page renders that as "OUR COST
   £0.00" — a screen stating a fact it does not have.**
4. **Marketing follow-ons** — THREE pieces, two done:
   a. ~~Founder screen for trial requests~~ **DONE 2026-07-29** (0151).
   b. ~~Marketing and design polish pass~~ **DONE 2026-07-29** apart from ONE thing needing
      Phil: a real testimonial quote, or take the social proof band out. **Phil, 2026-08-14:
      this waits until Thistle Care are up and running** — the testimonial should be theirs.
   c. ~~Trial provisioning, billing, expiry and conversion~~ **DONE 2026-07-29**, NOT as
      self serve (a stranger never creates a tenant). 0152/0153, lapse gate, /trial-ended,
      Pro fixed at £69 with a guard. ~~Env var + archive the £99 price~~ **DONE 2026-08-01**.
5. ~~**Public forms** — decide: switch on or delete.~~ **DECIDED 2026-08-02: LEAVE DORMANT,
   NOT AN OPEN QUESTION ANY MORE.** `PUBLIC_FORMS_ENABLED` stays false. Do NOT raise this
   again unless a real customer says their staff will not use logins.
6. ~~**Custom register columns** — decide: switch on or delete.~~ **BUILT 2026-08-03**
   (0167/0168). Setting lives in the register's Columns panel, EVERY tier, cap of SIX. One
   sentence: the colour always comes from the check, and you choose what the text says.
7. ~~**Verify the £44.63** on a drafted invoice, total £790.52.~~ **DONE 2026-08-01.**
   SETTLED RULE: a line is quantity x the printed unit price, both rounded to the penny, so
   that line bills £44.66 and the invoice PRINTS the price. The £790.52 never existed.
8. ~~**Test the letters**~~ **DONE 2026-08-10, all four steps pass.** Edited, booked,
   rearranged and cancelled; two emails each time with correctly different subjects for the
   employee and the chair. Phil confirmed the company's own wording reached the inbox.
9. ~~**Test the meeting outcome section**~~ **DONE 2026-08-10, PASS.** With nothing chosen
   "Warning remains live until" is ABSENT, not merely hidden, and a value typed then orphaned
   by switching to None does not leak: the key is not present in the stored evidence.
10. ~~**Test Return to Work end to end**~~ **DONE 2026-07-29**, all steps pass.
11. **Test the Registered roles emails** — digest, chaser and holiday approver.
    **PARTLY ANSWERED 2026-08-14 by reading the code, and the item is partly STALE:**
    - **The chaser no longer exists.** Phil, 2026-07-22: overdue items and their days overdue
      were folded into the two daily reports so recipients get exactly two emails a day. Only
      SMS escalation is still a separate chase. Nothing to test.
    - **The "digest" is SUPERVISORS ONLY.** Admins and the Registered roles get the two
      compliance reports instead. `getRecipients` normalises `registered_individual` and
      `registered_manager` to `company_admin`, so they receive both, company-wide. Correct.
    - **Holiday approver is correct**, and matches the approval matrix proved against RLS in
      item 12: company_admin + both Registered roles company-wide + branch Managers scoped to
      the request's branch. Notification and permission agree.
    - **DEFECT FOUND: a Supervisor's digest is always empty.** `scopeItems` still scopes
      supervisors by assigned caseload via `person_assignments`, which 0078 abandoned in July
      and which holds **0 rows** (as does `service_user_assignments`). The one role the digest
      exists for receives nothing, every day, silently. NOT YET FIXED.
    - **The fixture is empty**: Acme has no Supervisor and no Registered-role user, so nobody
      has ever received these. Closing the item needs one of each on Acme, the supervisor
      scoping fixed, and a cron run after 07:00 London (it is gated on the hour). That run
      sends real email to real inboxes, so it needs Phil's say-so.
12. ~~**Roles testing** — Supervisor, Viewer and Registered holiday approval.~~ **DONE
    2026-08-14**, against the live database by impersonating each role inside rolled-back
    transactions. Every boundary passed; only Phil's visual pass is left. Two things we
    believed turned out to be wrong: **Supervisor is BRANCH-WIDE, not caseload** (0078
    superseded the July rule and the note was never updated), and **there is no `viewer` role
    — "Viewer" is `team_member` relabelled** (0079). Full measured results, the approval
    matrix and the two traps that produce a false pass are in [permission-boundaries](permission-boundaries.md).
13. ~~**Invoicing crons**~~ **DONE 2026-08-10, PASS both halves.** CRON_SECRET was NOT
    needed: Vercel's Run button supplies it. Recurring drafted one invoice and advanced
    next_run_date by exactly 4 weeks; a second run drafted nothing. Overdue sent 2 then 0.
14. **Briefings, Framework, Planner and Business tier** final testing. Framework passed
    2026-08-10; Briefings hardened 2026-08-11 (items 30-32); **Planner Phase C DONE
    2026-08-14** — see item 39, which is what it turned into. **STILL OPEN: the Business
    tier**, which cannot be tested because no Business company exists.
15. ~~**Photo evidence on the Evidence PDF**~~ **DONE 2026-08-11.** Fetched at render time and
    drawn on the PDF, in the pack AND inline on screen. Live testing found a BLANK SECOND
    PAGE: the image box is now measured from the picture's real pixel size in the file header.
16. ~~**Extra branches are never charged.**~~ **DONE 2026-08-13, end to end with real money.**
    Price `price_1U3jJcRhL0XqZmTgw2kLiVz0` (£7.50 GBP monthly, licensed), `STRIPE_PRICE_BRANCH`
    set. Acme subscribed from its own billing page: invoice `U6ZNESFB-0069`, **£76.50 paid**.
    Add a branch moved the quantity to 2 with prorations; **Remove a branch** (0181) moved it
    back to 1 with the prorations cancelling to nothing. See [branch-billing](branch-billing.md).
17. **Stripe is a sandbox** — "Test Bill 2", acct_1TfLB1RhL0XqZmTg, holding all three
    businesses' products. Before launch, confirm which account and mode the production keys
    use and recreate the whole BCC price set there. Every price id in Vercel changes again.
18. ~~**Nothing ever enforces retention.**~~ **DONE 2026-08-11** (0171 + two follow-ups). The
    clock starts on leaver/discharge and clears when undone; a nightly 02:30 cron anonymises;
    a retention HOLD protects a tribunal; the privacy notice is true again. FOUR defects found
    in it by live testing, all mine, none visible in the code. See [retention](retention.md).
19. ~~**Training is invisible to the Registered roles.**~~ **DONE 2026-08-01** (0165).
20. ~~**The dashboard rebuild, increments 2 and 3.**~~ **DONE 2026-08-11.** "Policies up to
    date" links to `/briefings/coverage`. The first metric counted assignment ROWS and was
    wrong; the unit is one person and one policy, on the highest version signed.
21. ~~**Incidents, Safeguarding and Whistleblowing log**~~ **DONE 2026-08-12** (0174 to 0178).
    Two registers, per branch, categorised, dated, notifiable flag; Reg 80 auto-fills and the
    dashboard tile counts incidents awaiting action. A staff "Raise a concern" route where
    anonymous means `created_by` is NULL. **Whistleblowing is the ONE table with no
    `is_platform_admin()` clause.** ~~The category lists were written by Claude, not Phil.~~
    **SIGNED OFF by Phil 2026-08-14** — no longer an open question, see
    [incidents-whistleblowing](incidents-whistleblowing.md). Two pre-fix audit rows carrying the category were
    redacted by 0182.
22. **SMS: allowance, hard stop and replies.** Built 2026-07-31/08-01.
    a. ~~Monthly allowance with a hard stop at zero~~ **DONE** (0159/0160).
    b. ~~Tier list cut to Business, Pro, Black~~ **DONE** (0161).
    c. ~~Inbound replies and STOP~~ **DONE 2026-08-01** (0162).
    d. **OPEN, needs Phil:** the three Twilio variables in Vercel, buying the UK number, and
       pointing its webhook at `/api/webhooks/twilio/sms`. Claude does not handle the token.
    e. **OPEN:** the SMS top up Stripe price does not exist. Needs `STRIPE_PRICE_SMS_TOPUP`.
    f. **OPEN:** the bundle numbers are Claude's estimate, not modelled against real usage.
    g. **OPEN:** replies are filed and shown, not acted on. Nothing reads "YES" or "DONE".
23. ~~**`spend_ai_credit` is still executable by anon.**~~ **DONE 2026-08-11** (0172).
24. ~~**Settings > Notifications only lists Admins and Managers.**~~ **DONE 2026-08-11.**
    The senders already included the Registered roles, so it was PURELY the settings page.
25. ~~**Old drafts still bill at the old invoice rule.**~~ **NOT NEEDED** — all Acme.
26. ~~**The Training review batch.**~~ **DONE 2026-08-01/02**, plus /my training 2026-08-11
    (0173) and the not-recorded fold 2026-08-12. **Live testing as the test carer found the screen
    was wrong even though the data was right**: 33 red "Out of date" rows, every one a course
    nobody had ever recorded. Wording is now keyed on the state, not the colour.
    STILL OPEN from that review, not picked: no "booked" state; the register sorts on first
    name; the certificate input is a raw browser file input; and **all 33 seeded templates
    are mandatory, so a new customer's staff start life looking 100% non-compliant**.
27. ~~**Every date on every evidence record and PDF prints RAW ISO.**~~ **DONE 2026-08-10.**
    One `lib/dates.ts` `ukDate` helper. **It has leaked twice since**: the Reg 80 prose on
    2026-08-12, and the absence settings page on 2026-08-14 ("A policy was uploaded on
    2026-07-11"). Both fixed. Expect it again wherever a new screen prints a stored date.
28. ~~**Overdue reminder emails ignore branch scope.**~~ **DONE 2026-08-10.** Now an ALLOWLIST
    in `lib/invoicing/overdue-scope.ts`; the twin in briefings had the same shape.
29. ~~**`window.confirm` is back.**~~ **DONE 2026-08-10.** The app's own PORTALLED dialog, and
    NOT autofocused (a held Enter would auto-confirm a destructive action).
30. ~~**Briefings offered EVERY form.**~~ **DONE 2026-08-11.** SECURITY. Fixed with an
    ALLOWLIST enforced BOTH in the picker AND server-side in `assignItems`.
31. ~~**A Holiday-form briefing created NO holiday request.**~~ **DONE 2026-08-11.**
32. ~~**Identity fields not preseeded on a briefing form.**~~ **DONE 2026-08-10.**
33. ~~**Silence the holiday-request approver email for a company.**~~ **DONE 2026-08-11** (0169).
34. ~~**Show the first date back at work on the holiday card.**~~ **DONE 2026-08-11.**
35. ~~**Rename "Registered Individual" to "Responsible Individual".**~~ **DONE 2026-08-11.**
    LABEL ONLY — the role KEY `registered_individual` is unchanged.
36. ~~**Supervision 4 could never be completed, and the refusal was a DEAD END.**~~ **DONE
    2026-08-11** (0170). The BROWSER passed and the SERVER refused "4" with no highlighted
    field anywhere. The general guard matters more: `submitEvidence` now NAMES what it
    refused, one change in the one function all 13 submission paths share.
37. ~~**The Planner allowed impossible times and triple bookings.**~~ **DONE 2026-08-12**
    (0179, 0180). Times validated in the picker, the action AND a CHECK constraint; double
    bookings refused by three EXCLUDE constraints covering conductor, carer AND service user.
38. ~~**A branch could be added but never removed.**~~ **DONE 2026-08-13** (0181). Removal is
    an UNDO, never a way to erase history: the foreign keys CASCADE from `reg73_visits` and
    `reg80_reviews`, so a plain DELETE would have erased statutory records.
39. ~~**A booked conductor could not see who they were booked with — and could book
    themselves onto anyone.**~~ **DONE 2026-08-14** (0183), out of item 14 Phase C. the test Manager
    (Cardiff1, Newport1) was booked to supervise a carer in Caerphilly. **No leak** — but
    his Planner said "Supervision · **Ad-hoc** · Caerphilly" and Complete check dumped him on a
    28-record register that does not contain her, with no message. Phil: being booked to
    conduct a check IS the authorisation to see that person. **Checking first found a
    privilege escalation**: `planner_bookings_insert` validated the BOOKING's branch and never
    the SUBJECT's, so as the test Manager an insert naming Cardiff1 with a Caerphilly carer was ACCEPTED —
    which with the grant would have meant "book yourself onto anyone, then read their record".
    0183 makes the branch FOLLOW the subject via a BEFORE trigger (RLS then judges the
    corrected row) and grants only while `status = 'planned'` AND `created_by <> auth.uid()`.
    See [planner](planner.md). **Follow-on, not fixed:** `canManage` on the record page is a ROLE
    check, not per-record, so a manager now sees "Manage record" buttons whose writes RLS
    refuses.

40. **Company web address** (Phil, 2026-10-03, popup: Additions). Each company gets its own
    address (e.g. thistle.becarecompliant.com), like monday.com account URLs, with its own
    branded login page and room for single sign on later. Branding and enterprise extra
    only: it does NOT speed the site up or replace the database access rules. Scope to be
    talked through before building.

41. **Text a team member when they are emailed** (Phil, 2026-10-04, idea given while out; to
    talk about later). When an email goes to a team member, they also get an SMS. It is an
    option that is switched on, not always on. Not yet decided: whether it goes in Phase 13 or
    Additions, and the detail.

42. **Car registration numbers for driving staff** (Phil, 2026-10-04, while out). A reminder to
    collect the car registration number of each member of staff who drives. To talk through
    later: whether this is a field and a chase in BCC (alongside driver documents) or just a
    task for Thistle.

## Re-checked against code and data 2026-09-29 (Phil: "are you sure 11 is outstanding")
- Item 11 DONE: commit 0ffeb74f (2026-08-15) scopes Supervisors by branch (lib/notifications/scope.ts); notification_log shows 54 supervisor daily digests sent, last 2026-09-29; Registered roles receive both reports daily.
- Item 39 follow-on DONE in the same commit: canManageRecord (lib/auth/manage-scope.ts) decides Manage per record.
- Item 26 open points DONE: booked state + team booking (0ffeb74f), name column sorts four ways (2026-09-16), file inputs are buttons (2026-09-05), templates now 14 of 33 mandatory and courses scoped to job titles.
- Item 3: price set 2026-09-29 (AI top up £10 for 100). Still true: cost_pence is null on every usage_events row (24 AI, 2 SMS), so the founder page's "our cost" is not real.
- Item 22d: texts are being sent (trial request SMS 2026-09-29), so Twilio is configured; reply webhook not re-checked.

## Phase 13 additions (Phil, 2026-09-29)
- [stated] Two new departments to add, to be talked through later before building: 1. Safety Checks, 2. Maintenance.
- [stated] Two more Phase 13 features, same day, to be talked through later: Manager sign off, and a demo account.

## Fixed along the way 2026-07-27/29 (recorded so it is not re-found)

- **0150: a Company Admin could not invite a Registered Individual, Registered Manager,
  On Call user or another Company Admin.** SAME oversight as 0081. **Adding a role needs FIVE
  edits: DB check constraints, the `invites_insert` RLS policy, `Role` in lib/nav,
  `InviteRole`, and the `Profile` union.**
- **Signatures showed "Not provided" on the Evidence PAGE while the PDF said captured.**
- A second page/PDF divergence: the page printed conditional fields nobody was asked.
- ActionForm prompted twice on a confirm; a confirming button is no longer a submit button.
- Drafting never painted: a state update batched into useActionState's transition is
  deferred with it. Dispatch on the next tick.
- Empty AI reply burned a credit and said nothing useful; now refunds and reports why.
- **Pro was sold at £69 on the website and charged at £99 by Stripe.** Fixed, with a unit
  test, a founder health panel and a checkout refusal so it cannot recur.
- **The privacy notice claimed evidence is anonymised after eight years.** It was not.
- **The dashboard score defaulted to the WRONG REGULATOR** (cqc, everywhere else ciw).

## Fixed along the way 2026-07-30/08-01

- **PQS cycles never rolled forward.** Caerphilly, with 13 of 14 staff never supervised,
  reported "nothing was due" and scored better than a branch doing a little.
- **The compliance score read 85% "Good" while PQS was dire.** 0154 to 0156.
- **Two red Vercel builds**, both a file never committed because `git add` missed it. Every
  terminal block now ends with `git status --porcelain`.
- **I reasoned about a document I had not read.** READ THE RENDERED DOCUMENT.
- **A draft PDF could be EMAILED to a client.** Hiding a button is not enforcement.
- **The invoice server trusted the browser's unit price.** `repriceLines` now derives it.

## Fixed along the way 2026-08-01/03 (Training, then custom columns)

- **A REGRESSION I CAUSED AND LIVE TESTING CAUGHT.** `trainingStatus` inferred "done" from
  whether a date was present; 90 one off records have no dates, so all flipped green to red.
- **The training import had six data destroying defects caught in review.**
- **A `server-only` module imported as a VALUE into a client component.** tsc passes, it
  throws in the browser.
- **Un-parking a feature is not a flag flip.** Check what its DEFAULTS do when the guard comes off.

## Fixed along the way 2026-08-11 (the big one: EIGHT defects, seven of them mine)

**Every single one was found by looking at the actual artefact, not the code. Unit tests and
typechecking passed cleanly through all of them.**

- **A BLANK SECOND PAGE on a regulator's document** (item 15) — found by rendering the pages.
- **A cron that returned 200 on a completely failed run** (item 18). **"Nothing was due today"
  and "this has been broken for months" must never look the same from the outside.**
- **An "anonymised" record kept a full PDF of itself in the bucket** (item 18).
- **A retention clock that silently failed to STOP** (item 18) — found by reading the rows
  after the screen said "Saved".
- **`column reference "evidence_id" is ambiguous`** (item 18). The function had NEVER worked.
- **A dashboard tile that invented two non-compliant staff who did not exist** (item 20).
- **A carer's own screen accusing her of 33 lapsed courses** (item 26) — found by logging in
  as her.
- (Not mine) **Supervision 4 could never be completed** — see item 36.

## Fixed along the way 2026-08-12/14

- **The founder could read whistleblowing disclosures.** RLS reads the real `auth.uid()`, so
  support mode was irrelevant; `is_platform_admin()` was in all three policies. Removed (0177).
- **The Stripe customer kept the company's OLD name for ever.** Found by opening the customer
  in Stripe, not by reading our own row.
- **The monthly total forgot branches in FOUR places** — the customer billing page, the founder
  company page, the founder console MRR tile and the revenue page. Three of them were found
  AFTER the first was "fixed". Now one shared rule with REQUIRED inputs.
- **A zero-quantity "Extra Seat £0.00" line reached a real invoice.** `syncBranchQuantity` had
  always refused to create one; `syncSeatQuantity` never had the guard, and it only started
  firing when the plan change and the reconcile began calling it.
- **Untimed Planner bookings rendered amber** next to grey "Clear" days, so "no time set" read
  as a warning. Gold is for a time, not for the absence of one.
- **A raw ISO date on the absence settings page** — see item 27.

## Standing reminder about "existing data"

Acme Care Company is the TEST company. Before proposing a backfill, a migration of old rows or a
"fix the historic records" job, check whose data it actually is. Phil, 2026-08-02: "leave acme, it
is only a test company" — so do not offer to tidy test records away either.

**Test data Claude created on 2026-08-11**: two Supervision evidence records on a test carer record
(both deliberately anonymised to prove retention), and one training record for the test carer.

**2026-08-13**: Acme carries a REAL Stripe subscription in the sandbox
(`sub_1U46BgRhL0XqZmTg008eTiyw`, £76.50/month). A "Swansea Billing Test" branch was created and
removed the same evening; nothing of it remains.

Related: [permission-boundaries](permission-boundaries.md) [planner](planner.md) [branch-billing](branch-billing.md)
[tier-changes](tier-changes.md) [stripe-prices](stripe-prices.md) [incidents-whistleblowing](incidents-whistleblowing.md)
[suite-handover](suite-handover.md) [operations](operations.md) [look-at-the-artefact](../process/look-at-the-artefact.md) [tracking-drift](../process/tracking-drift.md)
[retention](retention.md) [training-import](training-import.md) [briefings](briefings.md) [testing-run-2026-08-10](testing-run-2026-08-10.md)
