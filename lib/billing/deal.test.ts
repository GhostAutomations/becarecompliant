import test from "node:test";
import assert from "node:assert/strict";
import { dealPrices, branchBands, branchExtrasPence, branchWord, parseDealForm, type DealRow } from "./deal.ts";

const list = { planPence: 12900, seatPence: 500, branchPence: 2500 };
const empty: DealRow = {
  billing_option: null, extras_billing: null, extra_users: 0, extra_branches: 0,
  plan_price_pence: null, seat_price_pence: null, branch_price_pence: null,
  branch_step_after: null, branch_step_price_pence: null, onboarding_fee_pence: null,
};

test("no deal means list prices and nothing special", () => {
  const p = dealPrices(null, list);
  assert.deepEqual(p, { planPence: 12900, seatPence: 500, branchPence: 2500, step: null, special: false });
});

test("a flat special branch price is used and marked special", () => {
  const p = dealPrices({ ...empty, branch_price_pence: 1000 }, list);
  assert.equal(p.branchPence, 1000);
  assert.equal(p.special, true);
});

test("Phil's nine houses: 7 extra, first 3 at £25 then £10 = £115 a month", () => {
  const p = dealPrices({ ...empty, branch_price_pence: 2500, branch_step_after: 3, branch_step_price_pence: 1000 }, list);
  assert.deepEqual(branchBands(7, p.step), [3, 4]);
  assert.equal(branchExtrasPence(7, p), 3 * 2500 + 4 * 1000);
});

test("fewer extra branches than the first step are all at the first price", () => {
  const p = dealPrices({ ...empty, branch_price_pence: 2500, branch_step_after: 3, branch_step_price_pence: 1000 }, list);
  assert.equal(branchExtrasPence(2, p), 5000);
});

test("setting the list price itself is not special", () => {
  assert.equal(dealPrices({ ...empty, plan_price_pence: 12900 }, list).special, false);
});

test("branch word defaults to Branch and adds an s when no plural is given", () => {
  assert.deepEqual(branchWord(null), { one: "Branch", many: "Branches" });
  assert.deepEqual(branchWord({ branch_word: "House" }), { one: "House", many: "Houses" });
  assert.deepEqual(branchWord({ branch_word: "Home", branch_word_plural: "Homes" }), { one: "Home", many: "Homes" });
});

const form = {
  billingOption: "annual", extrasBilling: "yearly", extraUsers: "2", extraBranches: "7",
  planPrice: "", seatPrice: "", branchPrice: "25", stepAfter: "3", stepPrice: "10",
  onboarding: "waived", onboardingAmount: "",
};

test("the deal form turns pounds into pence and keeps blanks as list price", () => {
  const r = parseDealForm(form);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.row.branch_price_pence, 2500);
    assert.equal(r.row.branch_step_price_pence, 1000);
    assert.equal(r.row.branch_step_after, 3);
    assert.equal(r.row.plan_price_pence, null);
    assert.equal(r.row.onboarding_fee_pence, 0);
    assert.equal(r.row.extra_branches, 7);
  }
});

test("a step price without the first price is refused", () => {
  const r = parseDealForm({ ...form, branchPrice: "" });
  assert.equal(r.ok, false);
});

test("bad money is refused in plain English", () => {
  const r = parseDealForm({ ...form, planPrice: "abc" });
  assert.equal(r.ok, false);
});

test("Monthly forces the extras monthly", () => {
  const r = parseDealForm({ ...form, billingOption: "monthly", extrasBilling: "yearly" });
  assert.equal(r.ok && r.row.extras_billing, "monthly");
});

test("a custom onboarding fee needs an amount", () => {
  assert.equal(parseDealForm({ ...form, onboarding: "custom", onboardingAmount: "" }).ok, false);
  const r = parseDealForm({ ...form, onboarding: "custom", onboardingAmount: "150" });
  assert.equal(r.ok && r.row.onboarding_fee_pence, 15000);
});

test("monthly parts at deal prices: Pro at £110, 1 extra user at £4, 7 houses two-step", async () => {
  const { dealMonthlyParts } = await import("./deal.ts");
  const parts = dealMonthlyParts(
    { ...empty, plan_price_pence: 11000, seat_price_pence: 400, branch_price_pence: 2500, branch_step_after: 3, branch_step_price_pence: 1000 },
    list,
    1,
    7,
  );
  assert.deepEqual([parts.basePence, parts.seatsPence, parts.branchesPence], [11000, 400, 11500]);
});
