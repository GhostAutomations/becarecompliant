import { test } from "node:test";
import assert from "node:assert/strict";
import { beforeStartProblem, START_GUARDED_KEYS } from "./before-start.ts";

test("a supervision before the start date is refused, on or after is fine", () => {
  assert.match(beforeStartProblem("Supervision", "2025-12-31", "2026-04-21") ?? "", /before this person started/);
  assert.equal(beforeStartProblem("Supervision", "2026-04-21", "2026-04-21"), null);
  assert.equal(beforeStartProblem("Supervision", "2026-05-01", "2026-04-21"), null);
});

test("nothing to compare: no complaint", () => {
  assert.equal(beforeStartProblem("Supervision", null, "2026-04-21"), null);
  assert.equal(beforeStartProblem("Supervision", "2025-12-31", null), null);
  assert.equal(beforeStartProblem("Supervision", "not a date", "2026-04-21"), null);
});

test("only supervision and appraisal are guarded, not training or competency", () => {
  assert.equal(START_GUARDED_KEYS.has("supervision"), true);
  assert.equal(START_GUARDED_KEYS.has("appraisal"), true);
  assert.equal(START_GUARDED_KEYS.has("competency"), false);
  assert.equal(START_GUARDED_KEYS.has("manual_handling"), false);
});
