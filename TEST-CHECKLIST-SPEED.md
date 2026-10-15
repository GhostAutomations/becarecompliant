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
  same as before, faster. Pass (on the evidence, at Phil's choice 2026-10-15: fingerprint identical
  for every Supervisor and Senior login, and a Thistle Supervisor used the app that morning under the
  new policies with no errors or warnings in the production logs).

## Push 2 (live, 0481)

- P2.0 Idle Realtime cost under 0.5s per 30s. Pass (Claude: 0 calls, 0ms in 60 seconds).
- P2.1 Old publication empty; Broadcast publication and slot untouched. Pass (Claude).
- P2.2 A live update still sends after 0481. Pass (Claude: no-op update on Bevan's test blackout
  sent its message on Bevan's private channel at 08:18:55).
- P2.3 Fingerprint after 0481, 15 logins. Pass (Claude; only real activity in between, matched by
  the no-RLS control).

## Sidebar (A and B)

- S1 Opening a page no longer fetches every sidebar page in the background (network: no burst of
  page requests). Pass (Claude in Phil's Chrome, 2026-10-15: one click made only its own request).
- S2 Resting the pointer on a sidebar item fetches that page; the click then shows it quickly. Pass
  (Claude: Service Users 0.32s and Training 0.40s with the pointer rested first, against 0.75 to 1.0s
  without).
- S3 Going back to a page visited recently is instant, and a change made meanwhile appears a moment
  later. Instant part Pass at 30 seconds (Claude: 0.02 to 0.03s; Phil saw the same). Memory then set
  to five minutes at Phil's popup; the five minute version and the catch up are Not tested.

## Sign in checked once (C)

- C1 Pages, saves and live updates still work signed in (Phil's Thistle login). Not tested.
- C2 The page guard no longer asks Auth again (logs: no guard.getUser on page loads). Not tested.
- C3 A request with no sign in, faking the header with a real user id, is still sent to sign in. Not tested.
- C4 A login signed in elsewhere (displaced session) is still signed out with the message. Not tested.
