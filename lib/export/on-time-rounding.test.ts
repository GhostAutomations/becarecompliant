import { test } from "node:test";
import assert from "node:assert/strict";
import { floorPct } from "./on-time-cycles.ts";

/**
 * Percentages on a compliance surface are rounded DOWN, never up (Phil, 2026-07-30).
 * 85 and 70 are PQS band boundaries, so rounding up hands a provider a band it has not earned.
 */

test("a rate is rounded down to one decimal, never up", () => {
  assert.equal(floorPct(2299, 2700), 85.1);
  // 84.96% must NOT become 85%: that is the difference between a PQS 5 and a PQS 7.
  assert.equal(floorPct(8496, 10000), 84.9);
  assert.equal(floorPct(69999, 100000), 69.9);
});

test("exactly 100 percent is 100, and nothing else reaches it", () => {
  assert.equal(floorPct(40, 40), 100);
  assert.equal(floorPct(9999, 10000), 99.9);
});

test("nothing due is null, not zero", () => {
  assert.equal(floorPct(0, 0), null);
  assert.equal(floorPct(5, -1), null);
});

test("none done is zero", () => {
  assert.equal(floorPct(0, 13), 0);
});
