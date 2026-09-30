import test from "node:test";
import assert from "node:assert/strict";
import { intervalsFromOrder, checkoutLines, onboardingDue } from "./annual.ts";

test("the Order decides monthly or yearly for the plan and the extras (Annual, 2026-09-30)", () => {
  assert.deepEqual(intervalsFromOrder(null), { plan: "month", extras: "month" });
  assert.deepEqual(intervalsFromOrder({ billing_option: "monthly", extras_billing: "yearly" }), { plan: "month", extras: "month" });
  assert.deepEqual(intervalsFromOrder({ billing_option: "annual", extras_billing: "yearly" }), { plan: "year", extras: "year" });
  assert.deepEqual(intervalsFromOrder({ billing_option: "annual", extras_billing: "none" }), { plan: "year", extras: "year" });
  assert.deepEqual(intervalsFromOrder({ billing_option: "annual", extras_billing: "monthly" }), { plan: "year", extras: "month" });
  assert.deepEqual(intervalsFromOrder({ billing_option: "none" }), { plan: "month", extras: "month" });
});

test("Checkout carries the extras only when they share the plan's interval", () => {
  const base = { basePriceId: "price_pro_y", seatPriceId: "price_seat_y", branchPriceId: "price_branch_y" };
  const yearly = checkoutLines({ ...base, extraSeats: 2, extraBranches: 1, plan: "year", extras: "year" });
  assert.deepEqual(yearly.lines, [
    { price: "price_pro_y", quantity: 1 },
    { price: "price_seat_y", quantity: 2 },
    { price: "price_branch_y", quantity: 1 },
  ]);
  assert.equal(yearly.addExtrasAfter, false);

  const mixed = checkoutLines({ ...base, seatPriceId: "price_seat", branchPriceId: "price_branch", extraSeats: 2, extraBranches: 0, plan: "year", extras: "month" });
  assert.deepEqual(mixed.lines, [{ price: "price_pro_y", quantity: 1 }]);
  assert.equal(mixed.addExtrasAfter, true, "the monthly extras are added by the sync once the subscription exists");

  const none = checkoutLines({ ...base, extraSeats: 0, extraBranches: 0, plan: "year", extras: "month" });
  assert.equal(none.addExtrasAfter, false, "nothing to add");
  assert.equal(checkoutLines({ ...base, extraSeats: 0, extraBranches: 0, plan: "month", extras: "month" }).lines.length, 1, "never a zero line");
});

test("the onboarding fee goes on the first invoice only when it is due", () => {
  assert.equal(onboardingDue({ tier: "pro", offerActiveOnStartDate: false, hadSubscriptionBefore: false }), true);
  assert.equal(onboardingDue({ tier: "pro", offerActiveOnStartDate: true, hadSubscriptionBefore: false }), false, "waived while the offer runs");
  assert.equal(onboardingDue({ tier: "pro", offerActiveOnStartDate: false, hadSubscriptionBefore: true }), false, "never twice");
  assert.equal(onboardingDue({ tier: "black", offerActiveOnStartDate: false, hadSubscriptionBefore: false }), false);
});
