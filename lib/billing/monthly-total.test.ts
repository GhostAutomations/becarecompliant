import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. monthly-total.ts has no runtime imports for exactly this reason. */
import { subscriptionMonthlyPence, monthlyRecurringPence } from "./monthly-total.ts";

const acme = {
  basePence: 6900,
  extraSeats: 0,
  seatPence: 500,
  extraBranches: 1,
  branchPence: 750,
};

test("THE CASE THAT STARTED THIS: the branch charge is in the total", () => {
  // The founder console said £69.00 while Stripe billed £76.50, because it added seats and
  // forgot branches.
  assert.equal(subscriptionMonthlyPence(acme), 7650);
});

test("a second branch moves the total, matching the Stripe quantity", () => {
  assert.equal(subscriptionMonthlyPence({ ...acme, extraBranches: 2 }), 8400);
});

test("seats and branches both count, at the same time", () => {
  assert.equal(
    subscriptionMonthlyPence({ ...acme, extraSeats: 3, extraBranches: 2 }),
    6900 + 1500 + 1500,
  );
});

test("nothing beyond the allowance is just the base", () => {
  assert.equal(
    subscriptionMonthlyPence({ ...acme, extraSeats: 0, extraBranches: 0 }),
    6900,
  );
});

test("a tier with no subscription totals nothing", () => {
  assert.equal(
    subscriptionMonthlyPence({
      basePence: 0,
      extraSeats: 0,
      seatPence: 500,
      extraBranches: 0,
      branchPence: 750,
    }),
    0,
  );
});

test("a missing or nonsense number is ZERO, never NaN", () => {
  // £NaN/mo on a billing page is worse than any wrong number.
  const bad = subscriptionMonthlyPence({
    basePence: Number.NaN,
    extraSeats: undefined as unknown as number,
    seatPence: 500,
    extraBranches: -4,
    branchPence: 750,
  });
  assert.equal(Number.isFinite(bad), true);
  assert.equal(bad, 0);
});

test("a fractional count never produces fractional pence", () => {
  assert.equal(subscriptionMonthlyPence({ ...acme, extraSeats: 1.9 }), 7650 + 500);
});

const annual = { basePence: 7900, extraSeats: 1, seatPence: 500, extraBranches: 0, branchPence: 2500, yearlyMonthsCharged: 10 };

test("MRR of Annual Business plus one yearly extra user is £840 / 12 = £70", () => {
  assert.equal(monthlyRecurringPence({ ...annual, planYearly: true, extrasYearly: true }), 7000);
});

test("MRR of a monthly company is its monthly total", () => {
  assert.equal(monthlyRecurringPence({ ...annual, planYearly: false, extrasYearly: false }), 8400);
});

test("MRR of Annual with monthly extras: plan over twelve plus the extras each month", () => {
  // 79 x 10 / 12 = 65.83..., plus 5 = 70.83 -> 7083 pence
  assert.equal(monthlyRecurringPence({ ...annual, planYearly: true, extrasYearly: false }), 7083);
});
