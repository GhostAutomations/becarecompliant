# Speed plan checklist

Each check: Pass, Fail or Not tested.

## Push 1 (live, 0478)

- P1.0 Fingerprint after 0478 identical to the baseline for all 15 logins. Pass (Claude, 2026-10-15).
- P1.1 Advisors: unindexed foreign keys 0, auth RLS initplan 0, security advisor no ERROR. Pass (Claude).
- P1.2 Phil, on becarecompliant.com as Thistle Admin: Dashboard, People, Service Users, Planner and
  Readiness open and show the same figures as yesterday. Not tested.

## Push 3 and 4 (preview, branch speed-overnight)

- P3.0 Old against new, all 15 logins: register status rows, rollups and Readiness identical. Pass (Claude).
- P4.1 Phil, on the preview as Thistle Admin: People register shows the same people, columns and
  colours as live. Not tested.
- P4.2 Same for the Service User register, including the hospital and respite colours. Not tested.
- P4.3 Readiness opens with no second request after it has drawn, and today's trend point is
  stored. Not tested.
