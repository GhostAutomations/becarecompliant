# Test checklist: absence discounting (0328)

Run as a Manager or above unless the check says otherwise. Results are recorded here as they are
run. Anything Not tested goes to Final Testing.

| # | Check | Result |
|---|-------|--------|
| D1 | Probe (scripts/absence-discount-probe.sql): Supervisor refused discount, direct edit, restart, clear and insert; last date edit still works; Manager discounts, twice is safe, reason kept; restore; restart and restart after a meeting; Admin clears; anon refused | PASS 2026-09-24, 18 checks |
| D2 | View absence: Discount asks for a reason, then the absence shows struck through with Discounted, who, when and why, and the card's occasions drop by one | |
| D3 | Count it again: the absence counts again and the card's occasions go back up | |
| D4 | Restart the count: a future date is refused; a past date with a reason shows "Count restarted from" in View absence and on the card, and earlier absences show Before the restart | |
| D5 | Undo restart: everything in the window counts again | |
| D6 | Record meeting as a Manager or above: after saving, the tick box popup lists the counted absences, nothing ticked; ticking two and saving discounts both with the meeting reason | |
| D7 | Record meeting: "No, nothing was discounted" closes it and changes nothing | |
| D8 | Supervisor: sees Discounted and the restart, but has no Discount, Count it again or Restart buttons, and no popup after a meeting | |
| D9 | Person record Absence tile shows the discounted absence struck through with a Discounted pill | |
| D10 | SAR export for a person with a discount: absence.csv has the three discount columns and absence-count-restarts.csv is present | |
