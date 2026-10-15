# Dashboard from the saved copy (0482)

Each check: Pass, Fail or Not tested.

- D0 The change notes are written by a save and can never fail it (rolled back proof). Pass (Claude, 2026-10-15).
- D1 Opening the Dashboard twice within the same ten minutes: the second open shows the same figures,
  and the server time drops (logs: no tile worked out). Pass (Claude in Phil's Chrome, 2026-10-15:
  repeat opens 0.26 to 0.49s of server time against 1.0s before, copy read in 70 to 87ms).
- D2 Something done (a check completed on Bevan): the next look at the Dashboard shows it done, and
  only the tiles that read it were worked out again. Part tested (Claude: a no op save on a Bevan
  check wrote one note, for Bevan and check_instances only; the rework itself is unit tested; seeing
  it on screen needs a Bevan login). Pass on the evidence, at Phil's choice 2026-10-15 (the note is proved, the rework is unit tested).
- D3 Someone on the Dashboard at a ten minute mark: the figures update quietly in place. Pass (Claude:
  Phil's open Dashboard asked for the rebuild itself at 09:50:05 and the copy was rebuilt behind the
  figures on screen).
- D4 Opening on a copy older than the last mark: the old figures show at once, then update. Pass on the evidence, at Phil's choice 2026-10-15
  (the same rebuild path as D3, which passed live).
- D5 Every figure on Phil's Thistle Dashboard matches what it showed before the change. Pass (Claude:
  every tile at 09:47 identical to 09:36).
