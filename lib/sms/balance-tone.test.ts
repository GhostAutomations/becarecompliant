import { test } from "node:test";
import assert from "node:assert/strict";
import { balanceTone } from "./balance-tone.ts";

test("green at 20 and above, amber below 20, red below 10", () => {
  assert.equal(balanceTone(25.5), "green");
  assert.equal(balanceTone(20), "green");
  assert.equal(balanceTone(19.99), "amber");
  assert.equal(balanceTone(10), "amber");
  assert.equal(balanceTone(9.99), "red");
  assert.equal(balanceTone(-1), "red");
});
