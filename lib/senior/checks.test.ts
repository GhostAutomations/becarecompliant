import { test } from "node:test";
import assert from "node:assert/strict";
import { seniorChecksOff } from "./checks.ts";

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
