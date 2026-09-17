import test from "node:test";
import assert from "node:assert/strict";
import { checkHeaderPlan, intervalDays, HISTORY_CAP } from "./check-columns.ts";

test("a history check carries the slot of its most recent completion", () => {
  // One number fixes the whole rotation; it cannot be derived from the dates.
  const p = checkHeaderPlan("care_plan_review", "Care Plan Review", true, 80);
  assert.equal(p.slotHeader, "Care Plan Review 1 slot");
  assert.deepEqual(p.headers.slice(0, 4), [
    "Care Plan Review next due date",
    "Care Plan Review 1 slot",
    "Care Plan Review 1 due date",
    "Care Plan Review 1",
  ]);
});

test("a check with one slot has nothing to rotate, so no slot column", () => {
  assert.equal(checkHeaderPlan("audit", "Audit", true, 90).slotHeader, null);
  assert.equal(checkHeaderPlan("setup", "Setup Visit", false, 0).slotHeader, null);
});

test("a one off check has no next due column", () => {
  // Setup Visit: one instance ever, so its due date IS the record's due date.
  const p = checkHeaderPlan("setup", "Setup Visit", false, 0);
  assert.equal(p.nextDueHeader, null);
  assert.deepEqual(p.headers, ["Setup Visit due date", "Setup Visit completed date"]);
});

test("a recurring check without history gets a next due and one pair", () => {
  const p = checkHeaderPlan("audit", "Audit", true, 90);
  assert.deepEqual(p.headers, ["Audit next due date", "Audit due date", "Audit completed date"]);
  assert.equal(p.slots.length, 1);
});

test("a history check repeats the pair, numbered, newest first", () => {
  // Care Plan Review every 80 days: two years is ten, capped at eight.
  const p = checkHeaderPlan("care_plan_review", "Care Plan Review", true, 80);
  assert.equal(p.slots.length, HISTORY_CAP);
  assert.equal(p.headers[0], "Care Plan Review next due date");
  assert.deepEqual(p.headers.slice(2, 6), [
    "Care Plan Review 1 due date",
    "Care Plan Review 1",
    "Care Plan Review 2 due date",
    "Care Plan Review 2",
  ]);
});

test("the completed headers are exactly what they were before due columns existed", () => {
  // A template somebody downloaded last week must still import.
  assert.deepEqual(
    checkHeaderPlan("care_plan_review", "Care Plan Review", true, 80).slots.map((s) => s.doneHeader),
    Array.from({ length: 8 }, (_, i) => `Care Plan Review ${i + 1}`),
  );
  assert.equal(checkHeaderPlan("audit", "Audit", true, 90).slots[0].doneHeader, "Audit completed date");
});

test("a long interval leaves one slot, not a fraction of one", () => {
  const p = checkHeaderPlan("supervision", "Supervision", true, 365);
  assert.equal(p.slots.length, 2);
  const yearly = checkHeaderPlan("supervision", "Supervision", true, 900);
  assert.equal(yearly.slots.length, 1);
  assert.equal(yearly.slots[0].doneHeader, "Supervision completed date");
});

test("a check that is not a history key stays single however often it recurs", () => {
  assert.equal(checkHeaderPlan("spot_check", "Spot Check", true, 30).slots.length, 1);
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
