import { test } from "node:test";
import assert from "node:assert/strict";
import { billedExtra, orderedExtrasFrom, orderedExtraOnPlan, NO_ORDERED_EXTRAS } from "./ordered-extras.ts";

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
  assert.deepEqual(orderedExtrasFrom({ extra_users: 2, extra_branches: 1, plan: "Business" }), {
    users: 2,
    branches: 1,
    tier: "business",
  });
});

test("a Black Order has no plan to count against", () => {
  assert.equal(orderedExtrasFrom({ extra_users: null, extra_branches: null, plan: "Black" }).tier, null);
});

test("Business with 1 extra user (5 users) is no extra on Pro, which includes 6", () => {
  assert.equal(orderedExtraOnPlan(1, 4, 6), 0);
});

test("Business with 3 extra users (7 users) is 1 extra on Pro", () => {
  assert.equal(orderedExtraOnPlan(3, 4, 6), 1);
});

test("on the same plan the ordered extras are unchanged", () => {
  assert.equal(orderedExtraOnPlan(2, 1, 1), 2);
});
