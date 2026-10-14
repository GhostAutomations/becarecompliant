# Service User Setup: due on the package start (Phil, 2026-10-14)

All companies, current and future, Demo included. Migration 0471.

- **Due ON the package start date**, not the day before. Stored on the Setup check (the Setup
  Visit's "days before start" is 0, and the template new companies are seeded from says 0).
- **One Setup column** on the Service User matrix. "Setup Visit Due" is gone; the remaining column
  is headed "Setup Visit" (key `setup_completed`, so a company's own shorthand still applies). It
  shows (`lib/service-users/setup-cell.ts`):
  - not done, before the due date: green "Due 20 Oct 26"
  - not done, on the due date: amber "Due 20 Oct 26"
  - not done, after it: red "Late"
  - done on or before the due date: the done date in green
  - done after it: the done date in red, for good, as a record it was late
  - no package start: nothing; paused (hospital, respite): "Paused", as the pause rules say.
- **Amber is the day itself only**: the Setup Visit's amber days are 0, which public.check_rag
  already reads that way, so the dashboard, readiness, rollups, reports, the morning email and the
  chasers all agree with the cell.
- **Settings stay editable** [stated]: "Change it so it is the setting for the same day, but leave
  it because other companies might want to change it." A one off check may now be 0 days from its
  anchor (the database rule allows 0 for one offs only; recurring checks still need at least 1).
- **Editing the package start moves a setup that is not done** to the new start (Phil's popup). A
  done setup is left alone.
- **Existing data** (Phil OK'd the list 2026-10-14): every setup check's stored due date moved to
  its package start (Thistle 71, Demo 40, Bevan 21). Thistle: 22 red done dates became green (done
  on the start day), 3 green became red (done the day after), 2 not done read "Late". Demo's 40
  sample setups, all done the day after the start, now show red (Phil: leave them red).
