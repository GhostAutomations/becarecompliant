# Test checklist: Service User Setup due on the package start, 2026-10-14

Decision: `docs/decisions/setup-due-rule.md`. Migration 0471 (applied 2026-10-14). Run one at a time.

Bevan test service users (Llanelli): "ZZ Setup Future (starts 20 Oct)", "ZZ Setup Today (starts
today)" (14 Oct 2026), "ZZ Setup Past (started 10 Oct, not done)", "ZZ Setup Done Early (done the
day before)" (start 1 Oct, done 30 Sep), "ZZ Setup Done On The Day" (2 Oct), "ZZ Setup Done Late
(done the day after)" (start 3 Oct, done 4 Oct). Their done dates were set directly as test data
(no form behind them).

| # | Check | Result |
|---|-------|--------|
| S0 | Claude's own checks: 9 new unit tests (before, on, after; done the day before, on, after; month end; 29 Feb 2028; the clock change; no start; paused); full suite 2,009 pass, typecheck and build pass; 0471 proved in a rolled back transaction, then applied: setup due dates moved Thistle 71, Demo 40, Bevan 21, the Setup Visit at 0 days and amber 0 in every company and the template; every other Service User check, every People check and readiness identical to before; the only database change besides the data is the one allowing 0 days for a one off; security advisor no ERROR | PASS (Claude) |
| S1 | Bevan test service users in the database: today amber, 20 Oct green (amber is the day only), 10 Oct red; the done ones count as complete | PASS (Claude) |
| S2 | Bevan, Service Users, Compliance, Llanelli (Claude in the browser as Bev): no "Setup Visit Due" column; the Setup Visit column shows Due 20 Oct 26 green, Due 14 Oct 26 amber, Late red, 30 Sep 26 green, 02 Oct 26 green, 04 Oct 26 red | PASS (Claude, Claude browser as Bev: exactly as stated) |
| S3 | Bevan: edit ZZ Setup Future's package start to 22 Oct 2026: its Setup shows Due 22 Oct 26 | PASS (Claude: saved through the edit form; the setup due date moved to 22 Oct 2026, the other checks kept theirs) |
| S4 | Thistle (Phil), Service Users, Compliance: no "Setup Visit Due" column; one service user done on the package start day now shows that date in green (was red), and one done the day after shows it in red (was green); the two are named in the job report, not here | PASS (Claude, the Founder managing Thistle at Phil's request: one Setup Visit column; every Newport and Cardiff Setup cell matches the database under the new rule, including the two named and the two not done showing Late; Phil accepted it) |
| S5 | Bevan (Phil): ZZ Setup Today shows amber "Due 14 Oct 26" | PASS (Claude as Bev; Phil accepted it) |
| S6 | Bevan (Phil): ZZ Setup Done Late shows 04 Oct 26 in red | PASS (Claude as Bev; Phil accepted it) |
