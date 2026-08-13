import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. removal.ts has no runtime imports for exactly this reason. */
import { describeBlockers, removalRefusal } from "./removal.ts";

test("a successful removal has nothing to say", () => {
  assert.equal(removalRefusal({ removed: true, name: "Swansea" }), null);
});

test("THE CASE THAT MATTERS: a branch with regulatory history is refused, and says why", () => {
  // Cardiff1 on the day this was written. A plain DELETE would have cascaded away the
  // Regulation 80 reviews without a word.
  const line = removalRefusal({
    removed: false,
    reason: "in_use",
    name: "Cardiff1",
    blocked_by: [
      { what: "training records", n: 518 },
      { what: "evidence", n: 294 },
      { what: "checks", n: 188 },
      { what: "Regulation 80 reviews", n: 7 },
    ],
  });
  assert.equal(
    line,
    "Cardiff1 has records against it, so it cannot be removed. It still has 518 training records, 294 evidence and 188 checks. Move them to another branch first.",
  );
});

test("the office row is never removable, and is not called a branch", () => {
  assert.equal(
    removalRefusal({ removed: false, reason: "not_a_branch", name: "Acme Care Company Office" }),
    "Acme Care Company Office is the company\'s office, not a branch, so it cannot be removed.",
  );
});

test("a company admin is told plainly that this is founder only", () => {
  assert.equal(
    removalRefusal({ removed: false, reason: "not_permitted" }),
    "Only the founder account can remove a branch.",
  );
});

test("an unnamed branch still produces a sentence", () => {
  assert.equal(
    removalRefusal({ removed: false, reason: "in_use", blocked_by: [] }),
    "That branch has records against it, so it cannot be removed. Move them to another branch first.",
  );
});

test("no result at all is a failure, never a silent success", () => {
  // The dangerous failure: an RPC that returned nothing reading as "removed".
  assert.equal(removalRefusal(null), "Could not remove the branch. Please try again.");
  assert.equal(removalRefusal(undefined), "Could not remove the branch. Please try again.");
  assert.equal(removalRefusal({}), "Could not remove the branch. Please try again.");
});

test("blockers are listed largest first, three at most, and read as English", () => {
  assert.equal(describeBlockers([{ what: "people", n: 7 }]), "7 people");
  assert.equal(
    describeBlockers([
      { what: "people", n: 7 },
      { what: "checks", n: 3 },
    ]),
    "7 people and 3 checks",
  );
  assert.equal(
    describeBlockers([
      { what: "people", n: 7 },
      { what: "checks", n: 3 },
      { what: "evidence", n: 2 },
      { what: "invites", n: 1 },
    ]),
    "7 people, 3 checks and 2 evidence",
  );
});

test("a zero or nonsense count is not a blocker", () => {
  assert.equal(describeBlockers([{ what: "people", n: 0 }]), "");
  assert.equal(describeBlockers([{ what: "people", n: Number.NaN }]), "");
  assert.equal(describeBlockers(null), "");
  assert.equal(describeBlockers(undefined), "");
});
