# The Dashboard from each person's saved copy, updated by push (Phil, 2026-10-15)

Phil: "the dashboard updates every 10 minutes ... between every update, whatever is done ... is done
as a push ... if someone was to go off the screen and go back at 12 minutes past, unless something
has been done, they would see the same dash; if something has been done they would see that change
because it's been done as a push to the dashboard data."

Popups (2026-10-15):
- A copy older than the last ten minute mark: show it at once, then update quietly.
- Every role's Dashboard.

## How it works

- Each person has their own saved copy (dashboard_snapshots, 0413), built from what they may see.
  Since this change it holds every tile, not only the slow figures.
- The whole copy is rebuilt on the clock, at :00, :10, :20 and so on: by the open Dashboard just
  after each mark, or straight after opening when the copy is older than the last mark (the old
  copy stays on screen until the new figures arrive).
- Something done is a push. The database notes, per company, when each table a tile reads last
  changed (dashboard_changes, 0482, statement level triggers that can never fail a save). On the
  next look, only the tiles that read a changed table are worked out again, before the page is
  drawn, so something done is never shown as outstanding. A change within a minute of a tile being
  worked out still counts (a save is timed when it starts), so the tile is worked out again.
- Which tiles read which tables: `TILE_TABLES` in `lib/dashboard/tiles.ts`, kept in step with the
  trigger list in 0482.
- Things that change only because time passes (a check becoming overdue at midnight) show at the
  next ten minute rebuild.
- The copy is only used for the role and the tiles the person could see when it was built; any
  change to those builds it afresh. Refresh still clears it.
- If the change notes cannot be read, every tile is worked out again rather than shown out of date.

## GDPR

The copy holds only what that person's own reads returned, is read only by the server, and is
overwritten each time. dashboard_changes holds no personal data: a company, a table name, a time.
