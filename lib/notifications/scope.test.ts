import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeItems } from "./scope.ts";

const CARDIFF = "b-cardiff";
const NEWPORT = "b-newport";
const CAERPHILLY = "b-caerphilly";

const ITEMS = [
  { branchId: CARDIFF, label: "cardiff person" },
  { branchId: NEWPORT, label: "newport person" },
  { branchId: CAERPHILLY, label: "caerphilly person" },
  { branchId: null, label: "no branch at all" },
];

test("THE DEFECT: a supervisor's digest is not empty", () => {
  /*
   * It always was. Scoping read person_assignments, which migration 0078 abandoned and which
   * holds zero rows, so every supervisor was scoped to nothing, buildDigests dropped them, and
   * no email was ever sent. Silence, from a chasing email, reads exactly like a company with
   * nothing overdue.
   */
  const scoped = scopeItems({ role: "supervisor", branchIds: [CARDIFF] }, ITEMS);
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].label, "cardiff person");
});

test("a supervisor is scoped exactly like a manager, because 0078 made them branch based", () => {
  const branchIds = [CARDIFF, NEWPORT];
  const asSupervisor = scopeItems({ role: "supervisor", branchIds }, ITEMS).map((i) => i.label);
  const asManager = scopeItems({ role: "manager", branchIds }, ITEMS).map((i) => i.label);
  assert.deepEqual(asSupervisor, asManager);
  assert.deepEqual(asManager, ["cardiff person", "newport person"]);
});

test("neither of them is emailed about a branch they do not run", () => {
  for (const role of ["manager", "supervisor"] as const) {
    const scoped = scopeItems({ role, branchIds: [CARDIFF] }, ITEMS);
    assert.ok(!scoped.some((i) => i.branchId === CAERPHILLY), role);
  }
});

test("an admin gets everything, including the item with no branch", () => {
  const scoped = scopeItems({ role: "company_admin", branchIds: [] }, ITEMS);
  assert.equal(scoped.length, 4);
});

test("an item with no branch is dropped for branch scoped recipients, not guessed at", () => {
  for (const role of ["manager", "supervisor"] as const) {
    const scoped = scopeItems({ role, branchIds: [CARDIFF, NEWPORT, CAERPHILLY] }, ITEMS);
    assert.ok(!scoped.some((i) => i.branchId === null), role);
  }
});

test("a recipient with no branches gets nothing, and does not fall through to everything", () => {
  // The failure mode to avoid in the other direction: an unassigned manager emailed about the
  // whole company.
  for (const role of ["manager", "supervisor"] as const) {
    assert.deepEqual(scopeItems({ role, branchIds: [] }, ITEMS), [], role);
  }
});
