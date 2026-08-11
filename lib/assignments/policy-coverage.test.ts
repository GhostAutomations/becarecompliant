import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. */
import {
  summarisePolicyCoverage,
  type ActivePolicy,
  type PolicyAssignmentRow,
} from "./policy-coverage.ts";

const MOBILE: ActivePolicy = { id: "pol-mobile", title: "Mobile Phones", version: 2 };
const ARCHIVED_ID = "pol-old";

function row(over: Partial<PolicyAssignmentRow> = {}): PolicyAssignmentRow {
  return {
    personId: "p1",
    personName: "Charlotte test",
    policyId: MOBILE.id,
    status: "completed",
    policyVersion: 2,
    ...over,
  };
}

// THE BUG THIS FILE EXISTS FOR. One person, one policy, five assignments across two versions.
// Counting rows said "two people behind" and named the same person twice; she is up to date.
test("many assignments of one policy to one person are ONE obligation, judged on the best", () => {
  const result = summarisePolicyCoverage(
    [
      row({ policyVersion: 1 }),
      row({ policyVersion: 1 }),
      row({ policyVersion: 2 }),
      row({ policyVersion: 2 }),
      row({ policyVersion: 2 }),
    ],
    [MOBILE],
  );
  assert.equal(result.assigned, 1);
  assert.equal(result.upToDate, 1);
  assert.equal(result.pct, 100);
  assert.deepEqual(result.behind, []);
});

test("signing only the old version leaves the person behind, and names the version", () => {
  const result = summarisePolicyCoverage([row({ policyVersion: 1 }), row({ policyVersion: 1 })], [MOBILE]);
  assert.equal(result.assigned, 1);
  assert.equal(result.upToDate, 0);
  assert.equal(result.behind.length, 1);
  assert.equal(result.behind[0].signedVersion, 1);
  assert.equal(result.behind[0].currentVersion, 2);
});

test("assigned but never completed reads as not signed", () => {
  const result = summarisePolicyCoverage([row({ status: "pending", policyVersion: 2 })], [MOBILE]);
  assert.equal(result.behind[0].signedVersion, null);
  assert.equal(result.upToDate, 0);
});

// A withdrawn instruction is not an obligation, and must not sit in the denominator for ever.
test("a cancelled assignment is not counted at all", () => {
  const result = summarisePolicyCoverage([row({ status: "cancelled", policyVersion: 1 })], [MOBILE]);
  assert.equal(result.assigned, 0);
  assert.equal(result.pct, null);
});

test("a cancelled assignment does not hide a real one", () => {
  const result = summarisePolicyCoverage(
    [row({ status: "cancelled", policyVersion: 2 }), row({ status: "pending", policyVersion: 2 })],
    [MOBILE],
  );
  assert.equal(result.assigned, 1);
  assert.equal(result.upToDate, 0);
});

test("an archived policy is ignored: nobody must be up to date on withdrawn wording", () => {
  const result = summarisePolicyCoverage(
    [row({ policyId: ARCHIVED_ID, policyVersion: 1 })],
    [MOBILE],
  );
  assert.equal(result.assigned, 0);
});

test("two people on one policy are two obligations", () => {
  const result = summarisePolicyCoverage(
    [row(), row({ personId: "p2", personName: "Bethan", policyVersion: 1 })],
    [MOBILE],
  );
  assert.equal(result.assigned, 2);
  assert.equal(result.upToDate, 1);
  assert.equal(result.pct, 50);
});

// Floored, never rounded up: 66.6% must not read as 67% on a compliance dashboard.
test("the percentage floors", () => {
  const result = summarisePolicyCoverage(
    [
      row(),
      row({ personId: "p2", personName: "B", policyVersion: 1 }),
      row({ personId: "p3", personName: "C", policyVersion: 1 }),
    ],
    [MOBILE],
  );
  assert.equal(result.pct, 33.3);
});

test("somebody on an old version is listed BEFORE somebody who never signed", () => {
  const result = summarisePolicyCoverage(
    [
      row({ personId: "p2", personName: "Aaron", status: "pending", policyVersion: 2 }),
      row({ personId: "p3", personName: "Zoe", policyVersion: 1 }),
    ],
    [MOBILE],
  );
  assert.equal(result.behind[0].personName, "Zoe");
  assert.equal(result.behind[1].personName, "Aaron");
});

test("nothing assigned reads as n/a, not as nought per cent", () => {
  assert.equal(summarisePolicyCoverage([], [MOBILE]).pct, null);
});
