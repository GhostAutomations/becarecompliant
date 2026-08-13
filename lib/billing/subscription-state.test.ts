import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. subscription-state.ts has no runtime imports for that reason. */
import { subscriptionHasEnded } from "./subscription-state.ts";

test("a cancelled subscription has ended", () => {
  // Acme's, on 2026-08-12. Stripe spells it with one L; we accept both.
  assert.equal(subscriptionHasEnded("canceled"), true);
  assert.equal(subscriptionHasEnded("cancelled"), true);
  assert.equal(subscriptionHasEnded("incomplete_expired"), true);
});

test("a LATE subscription has NOT ended, and must keep being billed", () => {
  // Treating these as ended would quietly stop charging a customer who is merely behind.
  for (const status of ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]) {
    assert.equal(subscriptionHasEnded(status), false, `${status} should not count as ended`);
  }
});

test("an unknown status is NOT treated as ended", () => {
  // Refusing to sync on unknown would leave a real subscription unbilled forever. Better
  // to attempt and be refused than to silently never charge.
  assert.equal(subscriptionHasEnded(null), false);
  assert.equal(subscriptionHasEnded(undefined), false);
  assert.equal(subscriptionHasEnded(""), false);
  assert.equal(subscriptionHasEnded("something_new_from_stripe"), false);
});

test("case and stray whitespace do not defeat it", () => {
  assert.equal(subscriptionHasEnded("Canceled"), true);
  assert.equal(subscriptionHasEnded("  canceled  "), true);
  assert.equal(subscriptionHasEnded("CANCELED"), true);
});
