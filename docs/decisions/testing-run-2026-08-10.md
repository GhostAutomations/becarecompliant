# Testing run 2026 08 10

> Live testing run 2026-08-10 (Phil logged into Chrome): items 8, 9, 13 PASS and 14 mostly done, the defects it found, and the three that were fixed and pushed the same day

Phil asked whether, logged into Chrome, Claude could test items 8, 9, 11, 12, 13 and 14. Answer given: yes to 8, 9, 13, 14 with one Chrome login, **no to 12** (four different logins, single session app, Claude does not type passwords) and **partly to 11** (Claude can trigger and verify what the server selected and queued, but cannot read an inbox).

**THE LESSON OF THE DAY: the value was not in the items passing. It was in what sat NEXT TO them.** All four items passed. Every serious defect was found beside the thing being tested, not in it.

## What passed

- **Item 9, meeting outcomes.** With nothing chosen "Warning remains live until" is ABSENT from the page, not merely hidden. Appears for both written warning options, goes for None. **A value typed then orphaned by switching to None does not leak**: the key is not even present in the stored evidence. Aside, documented not a bug: with nothing booked, Meeting Type is an empty dropdown by design (Phil, 2026-07-12), so an unbooked meeting records no stage.
- **Item 13, invoicing crons.** CRON_SECRET NOT needed: Vercel's Run button supplies it. Recurring drafted one invoice and advanced next_run_date by exactly 4 weeks; a SECOND run drafted nothing. Overdue sent 2 then 0, weekly dedupe holds. The first attempt looked broken because Acme has `overdue_reminders_enabled = false` and the cron was respecting it.
- **Item 8, the letters.** Edit (version 3, versions 1 and 2 kept), book (2 emails with correctly DIFFERENT subjects, the chair's says "with Coke Can"), rearrange, cancel. Phil confirmed the company's own wording reached the employee's inbox.
- **Item 14, Business tier.** `/invoicing` and `/complaints` typed into the address bar REDIRECT; `/api/reports/training` returns "available on the Pro tier and above". Server side, not just hidden. Dashboard tiles explain themselves rather than emptying.
- **Item 14, Framework.** 53% readiness, four CIW themes, outstanding items expand into named dated lists, AI assistant with a proper disclaimer, Environment honestly "Not mapped".
- **Item 14, policy signing.** The best bit of the product seen all day: **you cannot sign until you have read to the end** (a progress bar, the Sign button locked until 100%). Signature stored as a real PNG in the evidence bucket with a sha256, not a data URL in a JSON blob.

## FIXED AND PUSHED THE SAME DAY (commit 15fe710)

1. **A Manager was emailed seven private client invoices from a branch he does not manage**, names and amounts included. `runOverdueReminders` queried by company with no branch filter; it runs on the SERVICE ROLE client so RLS never applied. Now scoped and unit tested in `lib/invoicing/overdue-scope.ts`. **The twin in `lib/notifications/briefings.ts` had the same shape and was fixed with it.** BOTH were denylists ("if not a manager, show everything"), so the only thing stopping a supervisor was a `continue` in a cron route. **Both are allowlists now: company_admin all, manager their branches, anything else NOTHING.** Safety belongs in the function, not in a Set two files away.
2. **Every date on every evidence page and PDF printed raw ISO** ("Date of Meeting: 2026-07-16"). `case "date"` in `lib/form-format.ts` fell through with the text types, and one function renders both page and PDF. Same leak in the audit summaries (absence, planner, holidays), in the **cancellation letter a carer receives**, and in the holiday amendment email which put two formats in one paragraph. ONE helper now: `lib/dates.ts` `ukDate`. It REFUSES to roll an impossible date forward, because Date.UTC turns 30 February into 2 March and a real but wrong date on a regulator's document is worse than visible nonsense. `formatDateUk` in email/templates.ts now delegates to it.
3. **`window.confirm` was still inside ActionForm**, so it was in every confirming button in the app including the training Clear we thought we had fixed. Replaced with the app's own dialog.

**Two things review caught in my own fix, both worse than the bug:** the dialog must be PORTALLED, because `.glass-card` has a backdrop-filter and a `fixed inset-0` scrim then resolves against the CARD, so on a long card it lands below the fold and the button reads as broken; and it must NOT `autoFocus` the confirm button, because a button fires click on Enter KEYDOWN and a held Enter auto repeats onto it and confirms a destructive action nobody chose.

## STILL OPEN, found this run (see list items 30 to 32)

- **Briefings offers EVERY form**, including Supervision, Spot Check, Annual Appraisal, Probation Review, Audit. An Admin can send a carer their own supervision form to fill in about themselves, which files as Evidence against their record. `lib/public-forms/config.ts` exists precisely to stop this; Briefings has no catalogue.
- **A form briefing of the Holiday form creates NO holiday request.** the test carer completed it, it filed as Evidence, "Forms I have sent in" went 8 to 9, and "My holidays" still said "no holiday booked or waiting". Zero rows in holiday_requests. The same form through the public path creates a pending request and emails approvers.
- **Identity fields are not preseeded on a briefing form.** Name and "What area do you work for?" render blank on a screen already saying "Hello, [name], Care Assistant, Newport1". The area dropdown offers "Newport"/"Cardiff" while her branch is "Newport1", so the answer is a free floating string. `lib/public-forms/render.ts` already solves exactly this, render side only, seeding the value back on submit.
- 30 of 40 Planner bookings have no time, and the ones that do include 00:51, 01:53, 02:53, 23:52, while the booking form only offers 08:00 to 20:00.
- 7 evidence rows have a stored `pdf_path` predating the current pipeline, so their PDFs keep the old date format while the page shows the new one. All test data; deliberately not rewritten, because immutable evidence should not be regenerated.

## Phase C of item 14 never ran

Needs Phil signed in as **the test Manager login** (Manager, Cardiff1 + Newport1). A Planner booking was deliberately made for **a carer in Caerphilly**, to see whether his Planner shows a carer he cannot otherwise see. Active logins on Acme: the test Company Admin (admin), the test Manager (manager), the test carer (a staff member's email) (staff, linked to her person record). Six other invites were never accepted so cannot log in.

Related: [the-list](the-list.md) [letters-rtw](letters-rtw.md) [invoicing](invoicing.md) [holidays-absence](holidays-absence.md) [assignments-policies](assignments-policies.md)
