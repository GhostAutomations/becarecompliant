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

test("People's ten Checks are four, three and three, filled down the left first", () => {
  const ten = ["Supervision", "Annual Appraisal", "Spot Check", "Medication Competency", "Manual Handling", "Audit", "Mentoring", "Lead the Leader", "One to One", "Health Check"];
  assert.deepEqual(splitColumns(ten), [
    ["Supervision", "Annual Appraisal", "Spot Check", "Medication Competency"],
    ["Manual Handling", "Audit", "Mentoring"],
    ["Lead the Leader", "One to One", "Health Check"],
  ]);
});

test("a short list stays in one column; nothing is lost or repeated in a long one", () => {
  assert.deepEqual(splitColumns(["Setup Visit", "Care Plan Review", "Audit"]), [["Setup Visit", "Care Plan Review", "Audit"]]);
  for (const n of [6, 7, 8, 11, 12]) {
    const list = Array.from({ length: n }, (_, i) => i);
    const cols = splitColumns(list);
    assert.equal(cols.length, 3);
    assert.deepEqual(cols.flat(), list);
    assert.ok(Math.max(...cols.map((c) => c.length)) - Math.min(...cols.map((c) => c.length)) <= 1);
  }
});
