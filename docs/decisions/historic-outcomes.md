# Past outcomes and past outcome updates

Phil, 2026-10-13. Thistle asked to enter personal outcomes and outcome updates that happened
before they used the Outcomes page, so their PQS and Reg 80 evidence covers the last six months.

## What it is

- **A past outcome.** When adding an outcome, the tick box "This is a past outcome" shows From and
  To. From is when it began (`service_user_outcomes.start_date`). To is the outcome's target date
  (popup: "To date = the outcome's target date"), so it may still be ahead.
- **A past update.** When logging an update, "This is a past update" shows a date
  (`service_user_outcome_updates.dated_on`). A past update may also mark the outcome Achieved on that
  day (popup: yes). An achieved outcome can take past updates dated up to its achieved day.
- **Marked as entered later** (`entered_later`). On screen, in the data request export and in the audit
  log: "Added on [date] by [name], dated [date]".
- **Who may add them.** Whoever may add outcomes today (Managers and above, through the existing RLS).

## Time limited

- **A per company date.** `companies.historic_outcomes_until`, the last London day it is open. Null
  means off.
- **Who sets it.** Set, extended or cleared only by the Founder, in the Founder console company page
  ("Past outcomes and updates"). The companies founder column guard refuses anyone else.
- **Closing.** The option disappears by itself after that day. The database refuses a past entry from
  a signed in user once it has closed.
- **Thistle.** Switched on until Tuesday 27 October 2026, after Phil's go.

## Rules (enforced in the database, migration 0449, and in the actions)

- **No future dates.** From and an update's date can't be in the future.
- **To and From.** To can't be before From.
- **Updates and From.** An update can't be dated before its outcome began (From, else the day it was
  added).
- **Achieved outcomes.** Past updates can't be dated after the outcome was achieved, and a past
  Achieved can't sit before a later update.
- **Status.** A past update sets the outcome's status only when nothing on the outcome speaks for a
  later day. Filling in history never overwrites where an outcome stands now.
- **Discharged service users.** While the window is open, only past entries can be added for them,
  dated on or before their discharge (popup: "yes, past entries only"). They stay out of today's
  register and figures.

## How dates are read

- **An outcome's start.** It began on From, else the London date it was added.
- **An update's date.** It speaks for its own date, else the London date it was added.
- **History.** Updates are listed by that date.
- **When an update is due.** The outcomes RAG is due from the last update, else From, else the day it
  was added.

## PQS (Cardiff SAQ cycle 2 sheet, sent by Phil 2026-10-13)

- **The period figure.** Supplier Performance Q2 for a period is the position on the period's last
  day (popup). Every outcome begun by then counts, with the progress it had on that day. A period
  ending today is exactly today's figure, so today's numbers never move.
- **Discharged service users in past periods.** A discharged service user counts in a past period
  when they were still receiving a service on its last day (popup).
- **Bands.** Q2 has its own bands on the sheet: 85.01 to 100 = 10, 70.01 to 85.00 = 7, 50.01 to
  70.00 = 5, 1.00 to 50.00 = 2, 0.00 = 0. The rate is rounded down to two decimals.
- **The other percentage questions** keep 100 = 10, 85 = 7, 70 = 5, 50 = 2.

## Also fixed with it

- **F83.** The status check now allows no_change and regressing. `logOutcomeUpdate` now reports a
  refused status change instead of ignoring it.
- **Target date.** Editing an outcome's title or detail no longer erases its target date.
- **Review date.** An Individual Plan Review filed after the day it happened dates its outcome updates
  (and a new outcome's start) by the review's date, not the day it was typed in.

## Who counts in the outcomes figures (Phil, 2026-10-13, popup "Fix it now")

- **Receiving a service.** The register, the PQS outcomes row, the Dashboard and Readiness count service
  users who are active, in hospital or on respite (`RECEIVING_SERVICE` in
  lib/service-users/outcome-history.ts). Before this, only "active" counted, so someone in hospital
  dropped out.
- **Removed records.** A removed (archived) record never counts, whatever its status. Before this, a
  removed record whose status was still active stayed in.
- **Discharged.** A discharged service user counts only in a past period that ended before their
  discharge.
- **Effect on 13 Oct.** Thistle and Bevan unchanged; the Demo company 97 to 100 outcomes in scope.

