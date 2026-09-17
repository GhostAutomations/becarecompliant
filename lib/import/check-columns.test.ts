import test from "node:test";
import assert from "node:assert/strict";
import { checkHeaderPlan, intervalDays, ROTATION_SLOTS } from "./check-columns.ts";

test("a history check is one Due/Done pair per slot, numbered as the register numbers them", () => {
  const p = checkHeaderPlan("care_plan_review", "Care Plan Review", true, 80);
  assert.equal(p.isHistory, true);
  assert.equal(p.slots.length, ROTATION_SLOTS);
  assert.deepEqual(p.headers, [
    "Review 1 Due", "Review 1 Done",
    "Review 2 Due", "Review 2 Done",
    "Review 3 Due", "Review 3 Done",
    "Review 4 Due", "Review 4 Done",
  ]);
});

test("the register calls it Review, so the template does too", () => {
  // The check is named Care Plan Review; the column it draws is headed Review.
  assert.equal(checkHeaderPlan("care_plan_review", "Care Plan Review", true, 80).slots[0].dueHeader,
    "Review 1 Due");
  assert.equal(checkHeaderPlan("supervision", "Supervision", true, 80).slots[0].dueHeader,
    "Supervision 1 Due");
});

test("supervision follows the company's own cycle length", () => {
  assert.equal(checkHeaderPlan("supervision", "Supervision", true, 80, 3).slots.length, 3);
  assert.equal(checkHeaderPlan("supervision", "Supervision", true, 80, 4).slots.length, 4);
  assert.equal(
    checkHeaderPlan("supervision", "Supervision", true, 80, 4).headers.slice(-2).join(","),
    "Supervision 4 Due,Supervision 4 Done",
  );
});

test("everything else is one pair", () => {
  const audit = checkHeaderPlan("audit", "Audit", true, 90);
  assert.equal(audit.isHistory, false);
  assert.deepEqual(audit.headers, ["Audit Due", "Audit Done"]);
  const spot = checkHeaderPlan("spot_check", "Spot Check", true, 30);
  assert.deepEqual(spot.headers, ["Spot Check Due", "Spot Check Done"]);
});

test("a one off is marked, because its Due is its own deadline and not the next one", () => {
  const setup = checkHeaderPlan("setup", "Setup Visit", false, 0);
  assert.equal(setup.isOneOff, true);
  assert.equal(setup.isHistory, false);
  assert.deepEqual(setup.headers, ["Setup Visit Due", "Setup Visit Done"]);
  assert.equal(checkHeaderPlan("audit", "Audit", true, 90).isOneOff, false);
});

test("nothing is numbered when there is no rotation to number", () => {
  // A history key with a single slot is just a check, not a cycle.
  assert.deepEqual(checkHeaderPlan("supervision", "Supervision", true, 80, 1).headers,
    ["Supervision Due", "Supervision Done"]);
});

test("interval days converts the frequency, and a negative offset is not an interval", () => {
  assert.equal(intervalDays("day", 80), 80);
  assert.equal(intervalDays("week", 2), 14);
  assert.equal(intervalDays("month", 3), 90);
  assert.equal(intervalDays("year", 1), 365);
  // The Setup check is stored as day/-1, meaning the day BEFORE the package start.
  assert.equal(intervalDays("day", -1), 0);
  assert.equal(intervalDays(null, null), 0);
});
