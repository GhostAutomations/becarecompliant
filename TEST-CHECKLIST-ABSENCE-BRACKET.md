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
| B2 | ZZ Absence Test A card: pill reads "Stage 1 Due · Stage 2 Due", in Action required, "Meetings due: Stage 1 and Stage 2." | PASS (Chrome as Bev Admin, deploy e258e67e: pill "Stage 1 Due · Stage 2 Due", Action required, "Meetings due: Stage 1 and Stage 2.") |
| B3 | ZZ Absence Test B card: "Stage 1 Pending · Stage 2 Due", in Action required, the Stage 1 booking line still shows | PASS ("Stage 1 Pending · Stage 2 Due", Action required, "A Stage 2 meeting is due.", Stage 1 booking line 20 Oct 2026 at 10:00) |
| B4 | ZZ Absence Test C card: "Stage 2 Due", last meeting 1 | PASS ("Stage 2 Due", last meeting 1) |
| B5 | Test B, View absence: about twice as wide; top lines "Stage 1 · reached 29 Aug 2026 · Pending · meeting booked 20 Oct 2026" and "Stage 2 · reached 1 Oct 2026 · Due · after the Stage 1 meeting" | PASS (1,152px wide, twice the old 576px; both stage lines exactly as written) |
| B6 | Test B, View absence: one amber bar down the left joining all four absences, headed "Counting towards Stage 1 and Stage 2"; none says "Outside the window"; 29 Aug says "Stage 1 reached", 1 Oct "Stage 2 reached", the April ones "Counts" | PASS (one amber bar, "Counting towards Stage 1 and Stage 2", pills Counts, Counts, Stage 1 reached, Stage 2 reached; no Outside the window) |
| B7 | Test C, View absence: Stage 1 line reads "Dealt with · meeting on 6 Oct 2026"; Stage 2 Due; the bracket still joins all four (they reached Stage 2) | PASS ("Stage 1 · reached 29 Aug 2026 · Dealt with · meeting on 6 Oct 2026", Stage 2 Due no meeting booked, bracket "Counting towards Stage 2" over all four) |
| B8 | Each absence card is two lines: dates, days and pill; then Last date, Save last date and Discount side by side. Save last date and Discount still work (discount one on Test A, then Count it again) | PASS (two line cards; discounted 9 Apr on Test A: Stage 1 moved to reached 1 Oct, Stage 2 gone; Count it again brought back Stage 1 29 Aug and Stage 2 1 Oct. Save last date not pressed: unchanged code) |
| B9 | Test A, Book meeting: the Stage list offers Stage 1 and Stage 2, Stage 1 chosen to start with (close without sending) | PASS (Stage 1 and Stage 2 offered, Stage 1 chosen; closed, nothing sent) |
| B10 | Test B, Book meeting: only Stage 2 offered (close without sending) | PASS (only Stage 2; closed, nothing sent) |
| B11 | Test C, Record meeting: Meeting Type offers Stage 2; the absences listed are absence 4, 1 Oct 2026 (close without saving) | PASS (Meeting Type: Stage 2 only; "Stage 2 covers absence 4", "Absence 4: 01/10/2026"; closed, nothing saved) |
| B12 | Test A's record page: the Absence tile shows "Stage 1 Due · Stage 2 Due" | PASS (Absence tile shows "Stage 1 Due · Stage 2 Due") |
| B13 | Dashboard, Absences tile: "Invites to send" counts Test A, B and C | PASS (Dashboard: 3 Invites to send) |
| B14 | Phone: View absence fills the screen, the bracket and two line cards read cleanly, nothing cut off | |
| B15 | Thistle unchanged after the push: Thistle's Absence page, cards and View absence look exactly as before (Phil signed in as Founder in Thistle, or a Thistle manager) | |
| B16 | ZZ Stage One card (older Bevan test person with Stage 1, 2 and 3 meetings booked): one booking line per meeting, Stage 1 first | |
| B17 | Test C, Record meeting: current absence level reads "Stage 2 reached on 1 Oct 2026 with 4 absences in 6 months. Stage 2 covers absence 4." (close without saving) | |
