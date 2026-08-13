import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. tier-change.ts has no runtime imports for exactly this reason. */
import { tierChangePlan, isTierName } from "./tier-change.ts";

const live = (over: Record<string, unknown> = {}) => ({
  from: "business",
  to: "pro",
  actor: "company_admin" as const,
  hasLiveSubscription: true,
  ...over,
});

test("THE LAUNCH BLOCKER: a Business customer can upgrade itself to Pro", () => {
  const plan = tierChangePlan(live());
  assert.equal(plan.allowed, true);
  assert.equal(plan.allowed && plan.settlement, "swap_base");
});

test("upgrading with no subscription yet charges nothing until they subscribe", () => {
  const plan = tierChangePlan(live({ hasLiveSubscription: false }));
  assert.equal(plan.allowed, true);
  assert.equal(plan.allowed && plan.settlement, "none");
  assert.match(plan.allowed ? plan.note : "", /nothing is charged until they subscribe/);
});

test("THE THISTLE CASE: the founder moves a paying company to Black, billing stops at period end", () => {
  const plan = tierChangePlan(live({ from: "pro", to: "black", actor: "founder" }));
  assert.equal(plan.allowed, true);
  assert.equal(plan.allowed && plan.settlement, "cancel_at_period_end");
  assert.match(plan.allowed ? plan.note : "", /no money moves in either direction/);
});

test("a company can never put ITSELF on the free plan", () => {
  // The whole point of Black is that it is founder granted.
  const plan = tierChangePlan(live({ from: "pro", to: "black", actor: "company_admin" }));
  assert.equal(plan.allowed, false);
  assert.equal(plan.allowed === false && plan.reason, "Only the founder can put a company on Black.");
});

test("a company on Black cannot take ITSELF off it either", () => {
  const plan = tierChangePlan(live({ from: "black", to: "pro", actor: "company_admin" }));
  assert.equal(plan.allowed, false);
});

test("the founder moving a company OFF Black does not conjure a subscription", () => {
  // The ordinary case: a Black company has no subscription and no card. Checkout collects both.
  const plan = tierChangePlan(
    live({ from: "black", to: "pro", actor: "founder", hasLiveSubscription: false }),
  );
  assert.equal(plan.allowed, true);
  assert.equal(plan.allowed && plan.settlement, "none");
  assert.match(plan.allowed ? plan.note : "", /no card on file/);
});

test("UNDOING a move to Black calls the cancellation off, it does not shrug", () => {
  /* The window that loses money. Moving TO Black cancels at PERIOD END, so for up to a month a
     Black company still has a live subscription scheduled to stop. The first version of this
     rule returned "none" here regardless, which would have told the founder "nothing is
     charged" about a company still being charged, then silently cancelled them weeks later
     while they sat on a paid plan with everything unlocked. */
  const plan = tierChangePlan(
    live({ from: "black", to: "pro", actor: "founder", hasLiveSubscription: true }),
  );
  assert.equal(plan.allowed, true);
  assert.equal(plan.allowed && plan.settlement, "resume");
  assert.match(plan.allowed ? plan.note : "", /called off/);
});

test("downgrading Pro to Business is REFUSED, and says why", () => {
  // Not squeamishness: Pro includes 6 users and 2 branches against Business's 4 and 1, so the
  // extras bill rises as the base falls and the total barely moves.
  for (const actor of ["founder", "company_admin"] as const) {
    const plan = tierChangePlan(live({ from: "pro", to: "business", actor }));
    assert.equal(plan.allowed, false);
    assert.match(plan.allowed === false ? plan.reason : "", /not built yet/);
  }
});

test("moving to the plan they are already on is refused, not treated as a no-op", () => {
  const plan = tierChangePlan(live({ from: "pro", to: "pro", actor: "founder" }));
  assert.equal(plan.allowed, false);
  assert.match(plan.allowed === false ? plan.reason : "", /already on Pro/);
});

test("an unknown tier is refused at BOTH ends, never guessed", () => {
  // Guessing here moves real money.
  assert.equal(tierChangePlan(live({ to: "diamond" })).allowed, false);
  assert.equal(tierChangePlan(live({ from: "enterprise" })).allowed, false);
  assert.equal(tierChangePlan(live({ to: "" })).allowed, false);
  assert.equal(tierChangePlan(live({ from: null as unknown as string })).allowed, false);
});

test("isTierName admits exactly the three tiers", () => {
  assert.equal(isTierName("business"), true);
  assert.equal(isTierName("pro"), true);
  assert.equal(isTierName("black"), true);
  assert.equal(isTierName("diamond"), false);
  assert.equal(isTierName("enterprise"), false);
  assert.equal(isTierName(undefined), false);
});
