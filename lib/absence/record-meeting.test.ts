import { test } from "node:test";
import assert from "node:assert/strict";
import { recordableStages, stageFrom, unbookedMeetingProblem } from "./record-meeting.ts";

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
