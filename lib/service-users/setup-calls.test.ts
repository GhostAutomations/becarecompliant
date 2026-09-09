import { test } from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files, so the module under test is reached this way. */
import {
  callsFromSetupAnswers,
  carePlanRowsFromCalls,
  describeCalls,
} from "./setup-calls.ts";

test("a full day of calls is read in rota order", () => {
  const calls = callsFromSetupAnswers({
    call_bed_duration: "30m",
    call_morning_duration: "45m",
    call_morning_handed: "double",
    call_lunch_duration: "30m",
    call_tea_duration: "15m",
    call_tea_handed: "single",
  });
  assert.deepEqual(
    calls.map((c) => [c.slot, c.unit, c.handed]),
    [
      ["morning", "45m", "double"],
      ["lunch", "30m", "single"],
      ["tea", "15m", "single"],
      ["bed", "30m", "single"],
    ],
  );
});

test("a blank call is no call, not a zero length one", () => {
  const calls = callsFromSetupAnswers({ call_morning_duration: "30m", call_lunch_duration: "" });
  assert.deepEqual(calls.map((c) => c.slot), ["morning"]);
});

test("a duration the form never offered is ignored rather than billed", () => {
  assert.deepEqual(callsFromSetupAnswers({ call_morning_duration: "20m" }), []);
  assert.deepEqual(callsFromSetupAnswers({ call_morning_duration: 30 }), []);
  assert.deepEqual(callsFromSetupAnswers({ call_morning_duration: null }), []);
});

test("handedness left unanswered is single, which cannot over bill", () => {
  const [call] = callsFromSetupAnswers({ call_morning_duration: "1hr" });
  assert.equal(call.handed, "single");
  const [other] = callsFromSetupAnswers({ call_morning_duration: "1hr", call_morning_handed: "nonsense" });
  assert.equal(other.handed, "single");
});

test("no answers at all is no calls, not a crash", () => {
  assert.deepEqual(callsFromSetupAnswers(null), []);
  assert.deepEqual(callsFromSetupAnswers(undefined), []);
  assert.deepEqual(callsFromSetupAnswers({}), []);
});

test("two calls a day become fourteen rows, seven days the same", () => {
  const rows = carePlanRowsFromCalls([
    { slot: "morning", unit: "45m", handed: "double" },
    { slot: "bed", unit: "30m", handed: "single" },
  ]);
  assert.equal(rows.length, 14);
  assert.deepEqual([...new Set(rows.map((r) => r.day_of_week))], [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(rows.filter((r) => r.day_of_week === 3).length, 2);
});

test("every seeded row is one billable Care call", () => {
  const rows = carePlanRowsFromCalls([{ slot: "morning", unit: "1hr", handed: "double" }]);
  assert.equal(rows.every((r) => r.service === "Care"), true);
  assert.equal(rows.every((r) => r.quantity === 1), true);
  assert.equal(rows.every((r) => r.unit === "1hr" && r.handed === "double"), true);
});

test("position runs across the week, so the grid draws calls in the order they happen", () => {
  const rows = carePlanRowsFromCalls([
    { slot: "morning", unit: "45m", handed: "single" },
    { slot: "bed", unit: "30m", handed: "single" },
  ]);
  assert.deepEqual(rows.map((r) => r.position), [...Array(14).keys()]);
  assert.equal(rows[0].day_of_week, 0);
  assert.equal(rows[2].day_of_week, 1);
});

test("no calls makes no plan at all", () => {
  assert.deepEqual(carePlanRowsFromCalls([]), []);
});

test("the calls are described in words for the audit trail", () => {
  assert.equal(describeCalls([]), "no calls");
  assert.equal(
    describeCalls([
      { slot: "morning", unit: "45m", handed: "double" },
      { slot: "bed", unit: "30m", handed: "single" },
    ]),
    "morning 45m double handed, bed 30m",
  );
});
