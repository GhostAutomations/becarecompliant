# Speed plan checklist

Each check: Pass, Fail or Not tested.

## Push 1 (live, 0478)

- P1.0 Fingerprint after 0478 identical to the baseline for all 15 logins. Pass (Claude, 2026-10-15).
- P1.1 Advisors: unindexed foreign keys 0, auth RLS initplan 0, security advisor no ERROR. Pass (Claude).
- P1.2 Phil, on becarecompliant.com as Thistle Admin: Dashboard, People, Service Users, Planner and
  Readiness open and show the same figures as yesterday. Pass (Claude in Phil's Chrome at his
  request, 2026-10-15: all five 200 with no error; People Cardiff 13 = database 13; Service Users
  Cardiff 12 = database 12; Readiness drawn in full).

## Push 3 and 4 (merged to main at Phil's go, 2026-10-15; the preview was not looked at)

- P3.0 Old against new, all 15 logins: register status rows, rollups and Readiness identical. Pass (Claude).
- P4.1 On live after the merge, as Thistle Admin: People register shows the same people, columns and
  colours as before. Pass (Claude in Phil's Chrome at his request, 2026-10-15: page payload the
  same size as before the merge, 441KB; Cardiff 13 records = database 13).
- P4.2 Same for the Service User register, including the hospital and respite colours. Pass (Claude:
  payload the same size, 354KB; Cardiff 12 = database 12; whole request 1.34s before, 0.50 to 0.58s
  after).
- P4.3 Readiness opens with no second request after it has drawn, and today's trend point is
  stored. Pass (Claude: one GET, no POST; Newport's three scores for today stored at 07:50 UTC by
  the page itself).

## Push 1b (live, 0480)

- P1b.0 Each new list equals its old helper for all 78 profiles, every value. Pass (Claude, 0 mismatches).
- P1b.1 Fingerprint just before and after applying, 15 logins. Pass (Claude, all IDENTICAL).
- P1b.2 Security advisor no ERROR. Pass (Claude; 7 expected WARN, one per new helper).
- P1b.3 A Supervisor or Senior opens People, Service Users, Training and the Dashboard and sees the
  same as before, faster. Not tested.
