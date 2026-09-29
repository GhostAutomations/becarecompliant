import { test } from "node:test";
import assert from "node:assert/strict";
import { seniorChecksOff, splitColumns } from "./checks.ts";

test("with the list ticked, every Check not ticked is switched off", () => {
  assert.deepEqual(seniorChecksOff(true, ["a", "b", "c"], new Set(["b"])), ["a", "c"]);
  assert.deepEqual(seniorChecksOff(true, ["a", "b"], new Set(["a", "b"])), []);
});

test("a ticked box for a Check that is not active is ignored, not stored", () => {
  assert.deepEqual(seniorChecksOff(true, ["a"], new Set(["a", "zzz"])), []);
});

test("with the list unticked, its Checks are left as they were", () => {
  assert.equal(seniorChecksOff(false, ["a", "b"], new Set()), null);
});

test("People's ten Checks are five on the left and five on the right, in order", () => {
  const ten = ["Supervision", "Annual Appraisal", "Spot Check", "Medication Competency", "Manual Handling", "Audit", "Mentoring", "Lead the Leader", "One to One", "Health Check"];
  const [left, right] = splitColumns(ten);
  assert.deepEqual(left, ten.slice(0, 5));
  assert.deepEqual(right, ten.slice(5));
});

test("a short list stays in the left column; an odd long list puts the extra one on the left", () => {
  assert.deepEqual(splitColumns(["Setup Visit", "Care Plan Review", "Audit"]), [["Setup Visit", "Care Plan Review", "Audit"], []]);
  assert.deepEqual(splitColumns([1, 2, 3, 4, 5, 6, 7]).map((c) => c.length), [4, 3]);
});
