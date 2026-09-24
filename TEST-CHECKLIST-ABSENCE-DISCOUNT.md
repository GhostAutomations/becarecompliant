# Test checklist: absence discounting (0328)

Run as a Manager or above unless the check says otherwise. Results are recorded here as they are
run. Anything Not tested goes to Final Testing.

| # | Check | Result |
|---|-------|--------|
| D1 | Probe (scripts/absence-discount-probe.sql): Supervisor refused discount and direct edit; last date edit still works; Manager discounts, twice is safe, reason kept; restore; Admin can discount; anon refused | PASS 2026-09-24 (18 checks on 0328; restart checks withdrawn with 0329) |
| D2 | View absence: Discount asks for a reason, then the absence shows struck through with Discounted, who, when and why, and the card's occasions drop by one | PASS 2026-09-24 (Bevan, ZZ TEST DBS Warn) |
| D3 | Count it again: the absence counts again and the card's occasions go back up | PASS 2026-09-24. Phil: the "met. stage" box read as blank; the dash stays, the label is now "last meeting" |
| D4 | Restart the count | WITHDRAWN 2026-09-24. Built and working live (future date refused, restart from 15/08 took the count to 2), then Phil: "i think it needs to be automatic". Removed in 0329 |
| D5 | Meeting stages age out with the window (replaces Undo restart) | PASS 2026-09-24 by rolled back probe: a Stage 1 meeting 240 days ago sets no stage, one 60 days ago sets Stage 1; Thistle's nine cards unchanged |
| D6 | Record meeting as a Manager or above: after saving, the tick box popup lists the counted absences, nothing ticked; ticking two and saving discounts both with the meeting reason | |
| D7 | Record meeting: "No, nothing was discounted" closes it and changes nothing | |
| D8 | Supervisor: sees Discounted, but has no Discount or Count it again buttons, and no popup after a meeting | |
| D9 | Person record Absence tile shows the discounted absence struck through with a Discounted pill | |
| D10 | SAR export for a person with a discount: absence.csv has the three discount columns | |
