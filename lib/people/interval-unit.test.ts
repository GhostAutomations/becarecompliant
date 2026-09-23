import test from "node:test";
import assert from "node:assert/strict";
import { intervalUnit } from "./interval-unit.ts";

test("the Audit keeps its months (DEF-061)", () => {
  assert.deepEqual(intervalUnit("month"), { frequency: "month", plural: "months" });
});

test("days, weeks and years keep theirs", () => {
  assert.equal(intervalUnit("day").plural, "days");
  assert.equal(intervalUnit("week").plural, "weeks");
  assert.equal(intervalUnit("year").frequency, "year");
});

test("anything else is days, as the card always meant", () => {
  assert.equal(intervalUnit(null).frequency, "day");
  assert.equal(intervalUnit(undefined).frequency, "day");
  assert.equal(intervalUnit("fortnight").frequency, "day");
});
