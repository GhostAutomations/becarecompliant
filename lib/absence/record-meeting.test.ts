import { test } from "node:test";
import assert from "node:assert/strict";
import { availableStages, recordableStages, stageFrom, unbookedMeetingProblem } from "./record-meeting.ts";

test("booked stages are offered when there are any; all four when nothing is booked (DEF-072)", () => {
  assert.deepEqual(recordableStages([2]), [2]);
  assert.deepEqual(recordableStages([3, 1, 3]), [1, 3]);
  assert.deepEqual(recordableStages([]), [1, 2, 3, 4]);
  assert.deepEqual(recordableStages([0, 9]), [1, 2, 3, 4]);
});

test("the stage is read from the answer", () => {
  assert.equal(stageFrom("Stage 1"), 1);
  assert.equal(stageFrom("Stage 4"), 4);
  assert.equal(stageFrom("Stage 5"), null);
  assert.equal(stageFrom(""), null);
});

test("a meeting already held can be recorded; one still to come cannot", () => {
  const today = "2026-09-24";
  assert.equal(unbookedMeetingProblem({ stage: 1, dateIso: "2026-06-09", todayIso: today }), null);
  assert.equal(unbookedMeetingProblem({ stage: 1, dateIso: today, todayIso: today }), null);
  assert.match(unbookedMeetingProblem({ stage: 1, dateIso: "2026-09-25", todayIso: today })!, /Book meeting/);
  assert.match(unbookedMeetingProblem({ stage: null, dateIso: "2026-06-09", todayIso: today })!, /stage/);
  assert.match(unbookedMeetingProblem({ stage: 2, dateIso: null, todayIso: today })!, /date/);
});

test("available stages: from the next stage up to what the absences call for, at least the next", () => {
  assert.deepEqual(availableStages(null, null), [1]); // one absence, no meetings: Stage 1
  assert.deepEqual(availableStages(null, 2), [1, 2]); // four absences, no meetings
  assert.deepEqual(availableStages(null, 3), [1, 2, 3]); // five absences, no meetings
  assert.deepEqual(availableStages(1, 1), [2]); // Stage 1 held: Stage 2 next
  assert.deepEqual(availableStages(1, 3), [2, 3]);
  assert.deepEqual(availableStages(4, 4), []); // nothing after the last stage
});

test("record meeting offers the available stages when nothing is booked", () => {
  assert.deepEqual(recordableStages([], [1, 2]), [1, 2]);
  assert.deepEqual(recordableStages([2], [1, 2]), [2]);
});
