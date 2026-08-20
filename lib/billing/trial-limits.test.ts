import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: see the note in trial.ts. */
import {
  TRIAL_BRANCHES,
  TRIAL_INVITES,
  trialInviteRefusal,
  trialBranchRefusal,
  trialNotice,
} from "./trial-limits.ts";

test("a trial is one branch and two colleagues besides the Admin", () => {
  assert.equal(TRIAL_BRANCHES, 1);
  assert.equal(TRIAL_INVITES, 2);
});

test("a trial company may invite two people, and is refused the third", () => {
  const onTrial = true;
  // Admin only so far.
  assert.equal(trialInviteRefusal({ onTrial, activeBillable: 1, pendingBillable: 0 }), null);
  // Admin + one invited.
  assert.equal(trialInviteRefusal({ onTrial, activeBillable: 1, pendingBillable: 1 }), null);
  // Admin + two invited: full.
  const refusal = trialInviteRefusal({ onTrial, activeBillable: 1, pendingBillable: 2 });
  assert.match(String(refusal), /includes you and 2 colleagues/);
  assert.match(String(refusal), /Add a card/);
});

test("pending invitations count, or the limit means nothing", () => {
  // Ten invitations that all land tomorrow would otherwise sail past a limit on active users.
  assert.notEqual(trialInviteRefusal({ onTrial: true, activeBillable: 1, pendingBillable: 5 }), null);
});

test("a company that is NOT on trial is never refused", () => {
  // The standing rule everywhere else: never refuse to add the manager who signs things off.
  assert.equal(trialInviteRefusal({ onTrial: false, activeBillable: 40, pendingBillable: 9 }), null);
  assert.equal(trialBranchRefusal({ onTrial: false, branchCount: 12 }), null);
});

test("a trial covers one branch and refuses a second, naming the way out", () => {
  assert.equal(trialBranchRefusal({ onTrial: true, branchCount: 0 }), null);
  const refusal = trialBranchRefusal({ onTrial: true, branchCount: 1 });
  assert.match(String(refusal), /covers 1 branch/);
  assert.match(String(refusal), /Add a card/);
  assert.match(String(refusal), /nothing already recorded is affected/);
});

test("the trial notice says it is a trial, what it covers, and that a card is needed", () => {
  const msg = trialNotice(14);
  assert.match(msg, /free trial with 14 days left/);
  assert.match(msg, /1 branch and 2 colleagues/);
  assert.match(msg, /Payment details are needed/);
  assert.match(msg, /nothing is charged until you add them/);
});

test("one day left reads as a day, and an ended trial says nothing is deleted", () => {
  assert.match(trialNotice(1), /1 day left/);
  assert.match(trialNotice(0), /has ended/);
  assert.match(trialNotice(0), /nothing has been deleted/);
  assert.equal(trialNotice(null), "");
});
