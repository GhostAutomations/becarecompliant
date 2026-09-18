import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBookingTargets, visitIsComplete, visitLabel, visitProgress } from "./visit.ts";

test("a visit can be booked with three jobs on it", () => {
  assert.deepEqual(parseBookingTargets(["a", "b", "tracker:probation_review"]), [
    { instanceId: "a", trackerKey: null },
    { instanceId: "b", trackerKey: null },
    { instanceId: null, trackerKey: "probation_review" },
  ]);
});

test("the same job cannot be put on one visit twice", () => {
  assert.deepEqual(parseBookingTargets(["a", "a", " a "]), [{ instanceId: "a", trackerKey: null }]);
});

test("blanks and a bare tracker prefix are not tasks", () => {
  assert.deepEqual(parseBookingTargets(["", "   ", "tracker:"]), []);
});

test("one job names itself, several are counted", () => {
  assert.equal(visitLabel(null, ["Spot Check"]), "Spot Check");
  assert.equal(visitLabel(null, ["Spot Check", "Supervision"]), "2 tasks");
  assert.equal(visitLabel(null, ["Spot Check", "Supervision", "Medication Competency"]), "3 tasks");
});

test("an ad-hoc title always wins, and an empty visit still has a word on it", () => {
  assert.equal(visitLabel("Drop off rota", ["Spot Check"]), "Drop off rota");
  assert.equal(visitLabel(null, []), "Task");
  assert.equal(visitLabel("  ", []), "Task");
});

test("the visit is not finished until every job on it is", () => {
  assert.equal(visitIsComplete(["completed", "planned"]), false);
  assert.equal(visitIsComplete(["completed", "completed"]), true);
  assert.equal(visitIsComplete(["planned"]), false);
  assert.equal(visitIsComplete(["completed"]), true);
});

test("a called-off job does not hold the visit open", () => {
  assert.equal(visitIsComplete(["completed", "cancelled"]), true);
});

test("a visit whose jobs were all called off has not been carried out", () => {
  assert.equal(visitIsComplete(["cancelled", "cancelled"]), false);
});

test("a visit with no jobs on it is ad-hoc and closes by hand", () => {
  assert.equal(visitIsComplete([]), false);
});

test("progress is worth saying only when there is more than one job", () => {
  assert.equal(visitProgress(["planned"]), null);
  assert.equal(visitProgress(["completed", "planned", "planned"]), "1 of 3");
  assert.equal(visitProgress(["completed", "completed"]), "2 of 2");
});
