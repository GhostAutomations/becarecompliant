import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. base-item.ts has no runtime imports for exactly this reason. */
import { pickBaseItem, baseSwapDecision } from "./base-item.ts";

const SEAT = "price_seat";
const BRANCH = "price_branch";
const BASE = "price_pro";

const sub = [
  { id: "si_base", priceId: BASE },
  { id: "si_seat", priceId: SEAT },
  { id: "si_branch", priceId: BRANCH },
];

test("the plan line is the one that is neither seats nor branches", () => {
  const found = pickBaseItem(sub, SEAT, BRANCH);
  assert.equal(found.ok, true);
  assert.equal(found.ok && found.item.id, "si_base");
});

test("ORDER IS NOT PROMISED, so the answer must not depend on it", () => {
  // Picking "the first item" would rewrite the seat line's price and charge every user the
  // plan price.
  const found = pickBaseItem([sub[1], sub[2], sub[0]], SEAT, BRANCH);
  assert.equal(found.ok && found.item.id, "si_base");
});

test("a subscription with only a base line is fine", () => {
  const found = pickBaseItem([{ id: "si_base", priceId: BASE }], SEAT, BRANCH);
  assert.equal(found.ok && found.item.id, "si_base");
});

test("AN UNCONFIGURED ADD-ON PRICE MUST REFUSE, NEVER GUESS", () => {
  // The dangerous case: with STRIPE_PRICE_SEAT unset, nothing is excluded, so every line looks
  // like a plan line. Rewriting one of them would charge seats at the plan price.
  const found = pickBaseItem(sub, null, BRANCH);
  assert.equal(found.ok, false);
  assert.equal(found.ok === false && found.reason, "ambiguous");
  assert.equal(found.ok === false && found.count, 2);

  assert.equal(pickBaseItem(sub, undefined, undefined).ok, false);
  assert.equal(pickBaseItem(sub, "", "").ok, false);
});

test("a rotated price id shows up as ambiguous rather than as a silent mis-target", () => {
  // Old subscriptions still carry the old seat price after a rotation in Stripe.
  const found = pickBaseItem(sub, "price_seat_v2", BRANCH);
  assert.equal(found.ok, false);
  assert.equal(found.ok === false && found.reason, "ambiguous");
});

test("no plan line at all is refused, and says so distinctly", () => {
  const found = pickBaseItem([{ id: "si_seat", priceId: SEAT }], SEAT, BRANCH);
  assert.equal(found.ok, false);
  assert.equal(found.ok === false && found.reason, "none");
  assert.equal(pickBaseItem([], SEAT, BRANCH).ok, false);
  assert.equal(pickBaseItem(null, SEAT, BRANCH).ok, false);
  assert.equal(pickBaseItem(undefined, SEAT, BRANCH).ok, false);
});

test("an item with no price is not a candidate", () => {
  const found = pickBaseItem(
    [{ id: "si_base", priceId: BASE }, { id: "si_odd", priceId: null }],
    SEAT,
    BRANCH,
  );
  assert.equal(found.ok && found.item.id, "si_base");
});

const BUSINESS = "price_business";
const PRO = "price_pro_v1";
const TIERS = [BUSINESS, PRO];

test("a line on the OTHER tier's price is swapped: that is the case this exists for", () => {
  assert.deepEqual(baseSwapDecision(BUSINESS, PRO, TIERS), { swap: true });
});

test("a line already on the right price is left alone", () => {
  assert.deepEqual(baseSwapDecision(PRO, PRO, TIERS), {
    swap: false,
    reason: "already_correct",
  });
});

test("THE REGRESSION THIS PREVENTS: rotating a price must not migrate existing customers", () => {
  /* Somebody creates a new Pro Price at a new amount and points STRIPE_PRICE_PRO at it, meaning
     it for new customers. Swapping on "the id differs" would move every existing Pro customer
     onto it overnight, prorated, with nothing on any screen saying so. */
  const NEW_PRO = "price_pro_v2";
  assert.deepEqual(baseSwapDecision(PRO, NEW_PRO, [BUSINESS, NEW_PRO]), {
    swap: false,
    reason: "unrecognised_price",
  });
});

test("a grandfathered or negotiated price is somebody's deliberate arrangement", () => {
  assert.deepEqual(baseSwapDecision("price_special_deal", PRO, TIERS), {
    swap: false,
    reason: "unrecognised_price",
  });
});

test("a missing current price is never swapped on a guess", () => {
  assert.equal(baseSwapDecision(null, PRO, TIERS).swap, false);
  assert.equal(baseSwapDecision(undefined, PRO, TIERS).swap, false);
  assert.equal(baseSwapDecision("", PRO, TIERS).swap, false);
});

test("unconfigured tier prices do not make everything look recognised", () => {
  assert.equal(baseSwapDecision(BUSINESS, PRO, [null, undefined, ""]).swap, false);
});
