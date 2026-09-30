import { test } from "node:test";
import assert from "node:assert/strict";
import { orderCosts, branchesLineText, orderExtrasText, orderIncludedList, fillOrderTable } from "./fill.ts";
import { SUBSCRIPTION_AGREEMENT_1_0 } from "./text.ts";

const house = { one: "House", many: "Houses" };
const step = { after: 3, pricePence: 1000 };

test("nine houses on Pro: 7 extra, first 3 at £25 and 4 at £10, as two lines", () => {
  const c = orderCosts({
    tier: "pro", plan: "Pro", billingOption: "monthly", extrasBilling: "monthly", monthlyPence: 12900,
    annualMonths: 10, extraUsers: 0, extraBranches: 7, seatPence: 500, branchPence: 2500,
    onboardingFee: "Waived", branchStep: step, word: house,
  });
  const labels = c.groups[0].lines.map((l) => `${l.label} = ${l.amount}`);
  assert.deepEqual(labels, ["Pro plan = £129.00", "3 extra houses x £25.00 = £75.00", "4 extra houses x £10.00 = £40.00"]);
  assert.equal(c.totalText, "£244.00 a month plus VAT");
});

test("Annual yearly extras with a step are ten months each", () => {
  const c = orderCosts({
    tier: "pro", plan: "Pro", billingOption: "annual", extrasBilling: "yearly", monthlyPence: 12900,
    annualMonths: 10, extraUsers: 0, extraBranches: 7, seatPence: 500, branchPence: 2500,
    onboardingFee: "Waived", branchStep: step, word: house,
  });
  assert.equal(c.totalText, "£2,440.00 a year plus VAT"); // 1290 + 750 + 400
});

test("the Order line for the houses spells out both steps", () => {
  assert.equal(branchesLineText(7, 2500, "pro", step), "7: the first 3 at £25.00 a month each and 4 at £10.00 a month each");
  assert.equal(branchesLineText(2, 2500, "pro", step), "2, at £25.00 a month each");
});

test("extra prices and what is included use their word", () => {
  assert.match(orderExtrasText({ tier: "pro", seatPence: 500, branchPence: 2500, step, word: house }), /first 3 extra houses and £10 a month for each extra house after that/);
  assert.ok(orderIncludedList({ users: 6, branches: 2, ai: 50, sms: 100, word: house }).includes("office team and 2 houses"));
});

test("the Order table says Extra houses and ties House to the defined term", () => {
  const filled = fillOrderTable(SUBSCRIPTION_AGREEMENT_1_0, { "Extra branches": "7" }, { word: house });
  assert.match(filled, /\| Extra houses \| 7 \|/);
  assert.match(filled, /\| Your word for a branch \| House\. In this agreement, "Branch" means a house \|/);
});

test("with no word the Order table is unchanged", () => {
  const filled = fillOrderTable(SUBSCRIPTION_AGREEMENT_1_0, { "Extra branches": "2" });
  assert.match(filled, /\| Extra branches \| 2 \|/);
  assert.doesNotMatch(filled, /Your word for a branch/);
});
