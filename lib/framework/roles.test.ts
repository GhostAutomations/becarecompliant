import test from "node:test";
import assert from "node:assert/strict";
import { READINESS_ROLES, maySnapshotReadiness } from "./roles.ts";

test("readiness is for the Founder, Admins, the Registered roles and Branch Managers", () => {
  assert.deepEqual([...READINESS_ROLES].sort(), [
    "company_admin",
    "manager",
    "platform_admin",
    "registered_individual",
    "registered_manager",
  ]);
});

test("the company wide roles store a branch's scores and the company row", () => {
  for (const role of ["platform_admin", "company_admin", "registered_individual", "registered_manager"]) {
    assert.equal(maySnapshotReadiness(role, "b1"), true, role);
    assert.equal(maySnapshotReadiness(role, null), true, role);
  }
});

test("a Branch Manager stores their branch only, never the company row (audit F53)", () => {
  assert.equal(maySnapshotReadiness("manager", "b1"), true);
  assert.equal(maySnapshotReadiness("manager", null), false);
});

test("nobody else stores scores", () => {
  for (const role of ["supervisor", "recruiter", "senior", "staff", "team_member", "on_call", ""]) {
    assert.equal(maySnapshotReadiness(role, "b1"), false, role);
    assert.equal(maySnapshotReadiness(role, null), false, role);
  }
});
