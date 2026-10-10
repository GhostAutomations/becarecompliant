# Recurring invoicing diagnosis

> Recurring invoicing 2026-07-27 — the "not working" diagnosis and the FIX that was built the same day (arrears billing, one maths path, Draft it now, editable schedule record)

## STATUS: diagnosed AND fixed 2026-07-27. Built, reviewed cold, NOT yet built on Phil's machine or tested live.

Phil reported "the recurring invoicing isn't working".

**IT WAS NOT BROKEN IN THE WAY IT LOOKED.** There is exactly ONE schedule in the
database: id `ea8151f2-af03-431a-9e2c-16635467fecc`, Acme, weekly interval_count 4
(every 4 weeks), day_of_week 0 (Monday), created 2026-07-21, next_run_date
**2026-08-17**, 3 lines, 0 invoices drafted. `createInvoice` sets the first
`next_run_date` to issue date plus one FULL interval, so nothing had ever been due.

**CRON INFRASTRUCTURE IS PROVEN LIVE — never chase "the cron isn't firing".**
`/api/cron/daily-digest` (`0 6 * * *`) wrote 87 notification_log rows at 06:02 on
2026-07-27. `/api/cron/invoicing` (`0 7 * * *`) uses the IDENTICAL CRON_SECRET
fail-closed pattern, so the secret is set in production and Vercel is sending it.

The test client is **"AAAA AAAAAAA"**, id `4442c6fb-7725-4cf4-bc23-664ecfab4546`,
Caerphilly branch, private_invoicing true, invoice email = Phil's gmail. It is the
straddle-week test Service User from 21/07: 9 current care plan rows, 30 across all
versions. Phil asked why clicking its tile did nothing — the tiles were plain divs.

## The three real bugs (all now fixed)

1. **PENNY BUG.** cron.ts drafted with `Math.round(quantity * unit_price_pence)` and
   totalled with `computeTotals` — the rounded-unit-price maths the BUILDER moved off on
   2026-07-21. Proof on Phil's own line: Care 15m single x14 at unit_price 638 (£6.375
   rounded to £6.38) billed £89.32; correct is 14 x 0.25hr x £25.50 = **£89.25**. 30m and
   1hr lines come out exact, which is why it hid.
2. **WEEK GROUPING LOST.** invoice_schedule_lines DO store period_start/period_end
   (Phil's carry 29/06 to 05/07) but the cron never selected or copied them.
3. **FROZEN QUANTITIES.** The cron replayed the lines captured at schedule creation and
   never re-read the care plan, so a changed plan (versioned since 0099) was billed
   wrong silently, forever.

## What was built (2026-07-27)

- **NEW PURE MODULE `lib/invoicing/care-plan-billing.ts`** — BuilderLine, PlanEntryRow,
  HANDED_SUFFIX, addDaysUtc, rateLookup, buildCarePlanLines — lifted out of
  invoice-actions.ts. STANDING POINT: the builder has a user session and an RLS client,
  the cron has neither, which is why the cron could not call `carePlanLinesForPeriod`
  and drifted onto its own maths in the first place. Keep the maths in this pure module
  so that can never happen again. `carePlanLinesForPeriod` is now a fetch-and-delegate
  wrapper.
- **`draftFromSchedule(supabase, schedule, runDate)` in cron.ts** (+ exported
  `ScheduleRunRow`, `SCHEDULE_RUN_COLUMNS`, `DraftResult`). `runRecurringInvoices`
  claims by advancing next_run_date as before, then calls it. Re-derives from the care
  plan when the schedule was built from one — the marker is that its lines carry
  `period_start` — falling back to the frozen lines so a client never gets an empty
  invoice. BOTH paths price with `lineAmountPence`, so even a replayed flat line is exact.
  period_start/period_end are carried onto invoice_lines.
- **BILLING PERIOD = IN ARREARS** (Phil, popup 2026-07-27). New `billingPeriodFor(runDateIso,
  frequency, interval)` in types.ts: a run bills the cadence that has just finished, so a
  4-weekly schedule running Mon 17/08 bills the 28 days ending Sun 16/08, and a monthly
  one bills the month just gone. Rationale he accepted: you invoice care actually
  delivered, so nothing needs crediting back if the care changed or the client was in
  hospital, and it matches his own test invoice.
- **SCHEDULE RECORD PAGE** `/invoicing/schedules/[id]` (Phil: "if its clickable it could
  be editable"): what it bills and the exact next period, whether it reads the care plan
  (linked, with row count) or repeats fixed lines, an editable cadence / day-of-week /
  day-of-month / next-run-date form, the lines, invoices raised from it, and Cancel.
  New `getSchedule` + `ScheduleDetail` in data.ts, new `updateSchedule` +
  `draftScheduleNow` actions. Tiles on the list are now links, dates as dd/mm/yyyy.
- **"DRAFT IT NOW"** runs the SAME draftFromSchedule the cron runs, bills the cadence
  ending yesterday, and DELIBERATELY does NOT advance next_run_date, so testing never
  shifts a live client's billing date. Audits as `invoicing.schedule_drafted_manually`,
  redirects to the drafted invoice.

## Watch for

The one week vs four week mismatch on Phil's own schedule: it was built from a ONE WEEK
invoice (29/06 to 05/07) but repeats every 4 weeks. With arrears billing the run now
bills the full 28 days from the care plan, which is almost certainly what he wants, but
if a future schedule looks like it is billing more than expected, check that mismatch
first.

Test steps are logged in PHASES.md under Phase 11 Final Testing.

Related: [invoicing](invoicing.md) [tracking-drift](../process/tracking-drift.md) [phase6-built](phase6-built.md)
