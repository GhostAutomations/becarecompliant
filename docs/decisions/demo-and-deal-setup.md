# Demo and deal setup

> Phil's spec (2026-09-30) for the Demo Care Company Limited demo/trial logins, founder-built customer setup (tier, seats, branches, trial length, agreement then payment), renaming "branch" per company (e.g. "house"), and negotiated per-branch pricing. Read before planning or building any of it.

Phil's words, 2026-09-30, to be the NEXT piece after the test company switch (I8) is done.
- [stated] Placement (popup): this phase (13), straight after I8. Plan by popup before any code.

## Demo / trial account
- [stated] A demo company called "Demo Care Company Limited".
- [stated] Use: after a Teams or sales call, when someone asks for a demo, Phil issues them login details straight away.
- [stated] Founder can create a set of login details for someone and issue them.
- [stated] They get a fully working demo as if on a full account, which Phil believes is Pro.
- [stated] It must not send any SMS.
- [stated] AI can be demoed: up to 5 AI credits per login.
- [stated] Only Phil issues the logins; demo users must have no way to create logins (so they cannot get more AI).

### Demo decisions (popups 2026-09-30)
- [stated] Demo company is full of made-up sample data (People, Service Users, green/amber/red checks, evidence, absences, complaints, incidents; clearly invented names).
- [stated] A fresh demo company for each client (not one shared). Phil sets the password and duration when setting it up.
- [stated] A demo login can do everything a Company Admin on Pro can, minus logins (invites/roles) and billing; SMS off.
- [stated] Demo login expiry: default 7 days, but Phil can set any length.
- [stated] One login per demo by default; Phil can add more for the same client, each with its own 5 AI credits.
- [stated] Inside the demo the name is always "Demo Care Company Limited"; in Founder each demo is listed as "Demo for <client>" with its end date.
- [stated] At the end date logins stop (message to contact Phil); 14 days to extend; then the demo company and everything in it is deleted automatically.
- [stated] Nothing carries over from a demo to the client's real account; the real account starts clean.

### Demo usage tracking and feedback survey (Phil, 2026-09-30)
- [stated] In the founder section (against the demo set up for someone who asked for a trial), track per demo login: how many times they logged in, total time logged in, average login time, and which part of the app they used most.
- [stated] A feedback survey for demo users: what they liked, what they didn't like, anything we could do better, and some things rated out of five.
- [stated] Decisions (popup): part of the demo build, not Additions; time counts active use only (idle tab stops the clock); survey offered on screen 2 days before the demo ends, and if not completed, emailed automatically when the demo ends; ratings out of 5 for ease of use, how it looks, registers and checks, forms and evidence, reports, overall, plus how likely to sign up, and free text for liked, disliked, could do better.

## Founder-built customer setup (after the demo)
- [stated] Then Phil sets up the real account for them in Founder.
- [stated] At setup he builds the deal: tier (Business or Pro), number of branches, number of seats, when.
- [stated] Option for a trial: a week, two, three, four weeks, or even up to months.
- [stated] When their Admin first logs in they see the agreement, then the payment page.
- [stated] Once they have paid, Phil starts the full build, which transfers over all the information.

### Deal decisions (popups 2026-09-30)
- [stated] A "Deal" section on Founder > New company (extra users, number and names of branches, Monthly or Annual, special prices); the Admin sees it pre-filled and fixed on the Order and cannot change the numbers; Phil edits the deal from the founder page before they accept.
- [stated] With a trial: agreement at first login, payment step shows "Not yet, I'm in my free trial", and they cannot carry on after the trial ends until they pay. With no trial: pay straight after accepting.
- [stated] Branch word: set per company (singular and plural, e.g. House/Houses), used everywhere the customer sees it (menus, registers, filters, reports, agreement Order, Settings Billing, Stripe invoices); Founder still says branch with their word in brackets.
- [stated] Special branch prices: flat (one price per extra branch) or two-step (first N at one price, the rest at another), per company; Order, Settings Billing and Stripe all show the same split (Stripe graduated price made for that company).

- [stated] Special prices can override the plan price, the extra user price and branches (flat or two-step); blank = list price; Annual is still ten months for twelve on whatever price is set.
- [stated] Onboarding fee chosen per deal: waived, £295, or a typed amount; defaults to the current offer.
- [stated] Build order: deal setup (deal, branch word, special prices) FIRST, then the demo.
- [stated] Demo sample company size: 3 branches, about 50 staff and 40 service users.

## Renaming branches (e.g. "house")
- [stated] A client in talks has nine branches but calls them "houses".
- [stated] Phil wants to be able to rename "branch" to "house" for a company, so their first contract says house instead of branch (e.g. "9 houses, 2 included, paying for 7").
- [stated] Each house/branch then has its own name (e.g. "Treehouse" instead of Newport or Cardiff).

## Negotiated branch pricing
- [stated] In negotiation Phil wants to set a custom per-branch price, e.g. £10, £15 or £20 a branch instead of £25, or tiered: first 3 extra branches at £25 and all others at £10.
- [stated] He knows this complicates Stripe but wants it. "Houses" was an example; underneath it is branches.

### Phil's first look inside a demo (DM2, 2026-10-01)
- [stated] The demo bar ("everything here is made up, ends Thursday 8 October") is good.
- [stated] The dashboard is far too negative: CIW readiness "Action needed" on all three, 34 overdue, every Return to Work overdue. It should not look like that.
- [stated] Gaps with no examples: Planner empty, no recent activity, no on call follow ups, no policies, Training 0%, PQS report all 0% despite lots of people and service users.
- [stated] The AI credits tile shows company credits (0 used, n/a left) instead of the login's 5 of 5.
- [stated] Nothing about billing should show in a demo (the "Billing is not set up, 1 more branch" banner).
- [stated] Idea: encourage demo users to try their AI credits, e.g. a link from the demo bar to a demo-only page with every AI button and a short explanation of how to use each.
- [stated] Decisions (popup 2026-10-01): demo looks good with a few problems (about 85% in date, a handful due soon, 3 to 5 overdue, readiness mostly on track, PQS mostly green, 1 or 2 Return to Works due); build the "Try the AI" page now as part of the demo; delete the Test Client demo and set up a fresh one once the new sample data is ready.
- [stated] Idea (2026-10-01, after "The demo is ready" message): a Send invite button after that text, emailing the client their login details with a brief explanation and how to use the demo.
- [stated] Decision (popup 2026-10-01): build it now as an "Email them their login details" tick box (on by default) on Set up a demo and Add another login, sent on save; plus a Send login email button under "The demo is ready" that asks for the password again (it is never stored). Branded email: Log in button, email and password, end date, short how to (things to try, Try the AI, the survey).
- [stated] 2026-10-02 CHANGE (supersedes "Phil sets the password"): "can we issue a link where they set the password, it will look more secure to them". Phil needs to issue a demo on 3 Oct, so the outstanding demo tests (DM2, DM3, DM11, DM12, DM15, sign in from the email) and password reset R6 to R9 come first, in one push, tested by Claude.
