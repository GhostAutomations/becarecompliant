import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. seat-notice.ts has no runtime imports for exactly this reason. */
import { seatNotice } from "./seat-notice.ts";

const base = {
  activeUsers: 1,
  pendingInvites: 0,
  included: 4,
  extraSeatPence: 500,
  hasSubscription: true,
};

test("nothing is said while the company is inside its allowance", () => {
  assert.equal(seatNotice({ ...base, activeUsers: 4 }).show, false);
  assert.equal(seatNotice({ ...base, activeUsers: 2, pendingInvites: 2 }).show, false);
});

test("THE THISTLE CASE: 1 active, 6 invited, 4 included, no subscription", () => {
  const n = seatNotice({ ...base, activeUsers: 1, pendingInvites: 6, hasSubscription: false });
  assert.equal(n.show, true);
  // Nothing is charged for an invitation, so "now" is zero and the warning is about later.
  assert.equal(n.extraNow, 0);
  assert.equal(n.extraWhenAccepted, 3);
  assert.equal(n.costWhenAcceptedPence, 1500);
  assert.match(n.message, /3 extra users/);
  assert.match(n.message, /£15\.00 a month/);
  assert.match(n.message, /Billing is not set up yet, so nothing is being charged/);
});

test("with billing live, a pending invite is described as what it WILL cost", () => {
  const n = seatNotice({ ...base, activeUsers: 4, pendingInvites: 1 });
  assert.match(n.message, /1 extra user — £5\.00 a month — once everyone has accepted/);
});

test("with billing live and nobody pending, it states what is being paid now", () => {
  const n = seatNotice({ ...base, activeUsers: 6, pendingInvites: 0 });
  assert.equal(n.extraNow, 2);
  assert.match(n.message, /paying for 2 extra users: £10\.00 a month/);
});

test("an invitation alone never counts as a charged seat", () => {
  // Seats are counted on ACTIVE users; an invite that is never accepted costs nothing.
  const n = seatNotice({ ...base, activeUsers: 4, pendingInvites: 3 });
  assert.equal(n.extraNow, 0);
  assert.equal(n.extraWhenAccepted, 3);
});

test("Black is effectively unlimited, so it never nags", () => {
  assert.equal(seatNotice({ ...base, activeUsers: 40, included: 9999 }).show, false);
});
