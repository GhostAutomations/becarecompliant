# Test checklist: absence stages at the date of each absence, the popup bracket, 2026-10-13

Thistle ticket. Behind `companies.absence_stage_history` (0457), on for Bevan only. Decision:
`docs/decisions/absence-stage-history.md`. Bevan test people (all with the ticket's dates: 1 to 7 Apr,
9 Apr, 29 Aug, 1 Oct 2026): ZZ Absence Test A (no meetings), ZZ Absence Test B (Stage 1 booked for
20 Oct, not held), ZZ Absence Test C (Stage 1 held 6 Oct with a verbal warning).

Run one at a time, signed in to Bevan as Bev Admin unless the step says otherwise. Absence page:
People, Absence.

| # | Check | Result |
|---|-------|--------|
| B0 | Unit tests: the ticket's pattern (no meeting, booked, held), month ends, leap year, clock change, multi day across the window start, the window's first day, a higher meeting not dealing with a lower stage, declined bookings, repeats, switch off unchanged | PASS (lib/absence/stage-history.test.ts 25, lib/absence/logic.test.ts 5) |
| B1 | Thistle dry run, read only: switch off gives exactly today's result for every Thistle person | PASS (checked through the real code on Thistle's data, 2026-10-13) |
| B2 | ZZ Absence Test A card: pill reads "Stage 1 Due · Stage 2 Due", in Action required, "Meetings due: Stage 1 and Stage 2." | |
| B3 | ZZ Absence Test B card: "Stage 1 Pending · Stage 2 Due", in Action required, the Stage 1 booking line still shows | |
| B4 | ZZ Absence Test C card: "Stage 2 Due", last meeting 1 | |
| B5 | Test B, View absence: about twice as wide; top lines "Stage 1 · reached 29 Aug 2026 · Pending · meeting booked 20 Oct 2026" and "Stage 2 · reached 1 Oct 2026 · Due · after the Stage 1 meeting" | |
| B6 | Test B, View absence: one amber bar down the left joining all four absences, headed "Counting towards Stage 1 and Stage 2"; none says "Outside the window"; 29 Aug says "Stage 1 reached", 1 Oct "Stage 2 reached", the April ones "Counts" | |
| B7 | Test C, View absence: Stage 1 line reads "Dealt with · meeting on 6 Oct 2026"; Stage 2 Due; the bracket still joins all four (they reached Stage 2) | |
| B8 | Each absence card is two lines: dates, days and pill; then Last date, Save last date and Discount side by side. Save last date and Discount still work (discount one on Test A, then Count it again) | |
| B9 | Test A, Book meeting: the Stage list offers Stage 1 and Stage 2, Stage 1 chosen to start with (close without sending) | |
| B10 | Test B, Book meeting: only Stage 2 offered (close without sending) | |
| B11 | Test C, Record meeting: Meeting Type offers Stage 2; the absences listed are absence 4, 1 Oct 2026 (close without saving) | |
| B12 | Test A's record page: the Absence tile shows "Stage 1 Due · Stage 2 Due" | |
| B13 | Dashboard, Absences tile: "Invites to send" counts Test A, B and C | |
| B14 | Phone: View absence fills the screen, the bracket and two line cards read cleanly, nothing cut off | |
| B15 | Thistle unchanged after the push: Thistle's Absence page, cards and View absence look exactly as before (Phil signed in as Founder in Thistle, or a Thistle manager) | |
