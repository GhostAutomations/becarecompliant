import test from "node:test";
import assert from "node:assert/strict";
import { datedFromStart, startSetsDue } from "./start-dated.ts";

test("Spot Check and Audit are dated from the start date", () => {
  assert.equal(datedFromStart("spot_check"), true);
  assert.equal(datedFromStart("audit"), true);
});

test("the rest still start blank (Phil, 2026-07-09)", () => {
  for (const key of ["supervision", "appraisal", "manual_handling", "competency", "mentoring", "one_to_one", "health_check"]) {
    assert.equal(datedFromStart(key), false, key);
  }
});

test("a moved start date re-dates only the checks it sets (Supervision is left alone)", () => {
  assert.equal(startSetsDue("spot_check", "completion"), true);
  assert.equal(startSetsDue("audit", null), true);
  assert.equal(startSetsDue("supervision", "completion"), false);
  assert.equal(startSetsDue("appraisal", "completion"), false);
  assert.equal(startSetsDue("spot_check", "expiry"), false);
});
