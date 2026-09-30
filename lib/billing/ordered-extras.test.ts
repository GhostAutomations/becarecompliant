import { test } from "node:test";
import assert from "node:assert/strict";
import { billedExtra, orderedExtrasFrom, NO_ORDERED_EXTRAS } from "./ordered-extras.ts";

test("ordered extras set the floor when fewer exist (the I3 case: ordered 1, none over)", () => {
  assert.equal(billedExtra(0, 1), 1);
});

test("people added beyond the Order are still charged", () => {
  assert.equal(billedExtra(3, 1), 3);
});

test("equal counts bill once, not twice", () => {
  assert.equal(billedExtra(2, 2), 2);
});

test("nothing ordered and nothing over bills nothing", () => {
  assert.equal(billedExtra(0, 0), 0);
});

test("never negative, never fractional", () => {
  assert.equal(billedExtra(-2, -1), 0);
  assert.equal(billedExtra(1.7, 0), 1);
  assert.equal(billedExtra(Number.NaN, 2), 2);
});

test("no acceptance row means nothing ordered", () => {
  assert.deepEqual(orderedExtrasFrom(null), NO_ORDERED_EXTRAS);
  assert.deepEqual(orderedExtrasFrom(undefined), NO_ORDERED_EXTRAS);
});

test("a Black acceptance (nulls) means nothing ordered", () => {
  assert.deepEqual(orderedExtrasFrom({ extra_users: null, extra_branches: null }), NO_ORDERED_EXTRAS);
});

test("reads users and branches from the row", () => {
  assert.deepEqual(orderedExtrasFrom({ extra_users: 2, extra_branches: 1 }), { users: 2, branches: 1 });
});
