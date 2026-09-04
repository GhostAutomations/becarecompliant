import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. defaults.ts has no runtime imports for exactly this reason. */
import { DEFAULT_NOTIFICATION_SETTINGS as D } from "./defaults.ts";

test("THE DECISION: chase the next day, again on the third, escalate on the fifth", () => {
  assert.equal(D.chaserFirstDays, 1);
  assert.equal(D.chaserSecondDays, 3);
  assert.equal(D.smsOverdueDays, 5);
});

test("THE INVARIANT: each step comes after the one before it", () => {
  assert.ok(D.chaserFirstDays < D.chaserSecondDays, "first chaser must precede the second");
  assert.ok(D.chaserSecondDays < D.smsOverdueDays, "SMS escalates after both chasers");
});

test("every step is a real number of days", () => {
  for (const [k, v] of Object.entries(D)) {
    if (typeof v !== "number") continue;
    assert.ok(Number.isInteger(v) && v > 0, `${k} must be a positive whole number of days`);
  }
});

test("email is on and SMS is off out of the box", () => {
  assert.equal(D.emailDigestEnabled, true);
  assert.equal(D.smsEnabled, false);
});
