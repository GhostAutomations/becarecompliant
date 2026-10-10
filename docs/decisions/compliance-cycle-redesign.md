# Compliance cycle redesign

> Major agreed change (2026-07-18) to how Supervision/Appraisal + Care Review schedule and colour, all companies — NOW BUILT, verified in code 2026-07-27

## STATUS: BUILT. Verified against the code 2026-07-27, NOT just from notes.

Phil corrected a stale reading of this file on 2026-07-27 ("if something is completed
late, it is red"). He was right. The rest of this file is the original agreement, kept
for the reasoning; the build state below is the truth. **Do not propose building this
again.** PHASES.md never logged it, which is how it came to look outstanding.

EVIDENCE (exact code read 2026-07-27):
- `lib/people/logic.ts` supervisionSlots line ~267:
  `rag = comp ? (due && comp > due ? "red" : "green") : "none"` — punctuality rule live.
  Line ~276 applies the same to previous-cycle slots (`hd && comp > hd ? "red"`).
- Same file, appraisal pill line ~324: `compRag = comp > addI(closedThirdSup) ? "red" : "green"`,
  with `"green"` when there is no completed cycle to judge lateness against.
- `lib/service-users/logic.ts` `reviewSlots()` EXISTS and implements Review 1-4 from the
  package start + interval (default 80 days), positional so Simple <-> Complex branch
  switching still works, final review restarts the cycle, and the same pill rule
  (`rag = comp ? (lateOf(k) ? "red" : "green") : "none"`, lines ~143 and ~151). Its own
  comment cites "Display model (Phil, 2026-07-18)".
- Reports: `lib/export/on-time.ts` classifies `onTime = compareCivil(next, due) <= 0`
  and renders "On time"/green vs "Late"/red. So stage 3 (reports) is done too.
- Importer: `lib/import/commit.ts` seeds via the `seed_migrated_completion` RPC
  (newest date advances the check), and deliberately does not flag mid-cycle states.

WHAT MAY STILL BE OPEN: a real live test pass of the whole cycle end to end, and
confirmation that existing companies were recomputed. Check before assuming.

---

## Original agreement (Phil, 2026-07-18), ALL companies incl existing

PILL RULE (Supervision, Annual Appraisal, Care Review): completed ON OR BEFORE its due
date = GREEN pill on the completed date; completed AFTER its due date = RED pill, and it
STAYS red permanently (a record it was late). Outstanding (not yet completed) item: keep
AMBER for due-soon, RED once overdue (amber retained, Phil chose).

SEQUENTIAL CYCLE, only ONE due date visible at a time, revealed on completion:
- People cycle: Sup 1 -> Sup 2 -> Sup 3 -> Annual Appraisal -> restart Sup 1.
- Service User cycle: Rev 1 -> Rev 2 -> Rev 3 -> Rev 4 -> restart Rev 1 (Rev 4 acts like
  the AA: it restarts).
- On AA complete (People) / Rev 4 complete (SU): first item due (Sup1/Rev1) = +80 days;
  every other due in the cycle cleared (blank).
- Completing the current item reveals ONLY the next one's due = prev completion + 80
  days; nothing further ahead shows a due until it is next in line.

Note: `companies.supervision_cycle_mode` (migration 0105) later added a per-company
Founder-set choice between 'appraisal' (Sup 1-3 + Annual Appraisal) and
'four_supervisions' (four supervisions, the 4th closing and re-dating the cycle).

See [phase3-decisions](phase3-decisions.md) (People check model) + [phase4-built](phase4-built.md) (SU model this
restructures) + [project-state](project-state.md).
- [stated] (2026-10-09) An appraisal done the same day as Supervision 3 counts as done: its tile must not go gold/active again; sharing a due date with the new Supervision 1 is fine since only one is active.
