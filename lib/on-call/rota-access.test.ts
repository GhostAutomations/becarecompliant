import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_BRANCH_ON_CALL_ROLES, ON_CALL_PERSON_ROLES, ON_CALL_ROLES, canSetRota } from "./rota-access.ts";

const ON = ["supervisor", "recruiter"];

test("who opens On Call: the office and On Call, never a Senior, Viewer or carer", () => {
  for (const r of ["company_admin", "registered_individual", "registered_manager", "manager", "supervisor", "recruiter", "on_call", "platform_admin"]) {
    assert.ok(ON_CALL_ROLES.includes(r), r);
  }
  for (const r of ["senior", "team_member", "staff"]) assert.ok(!ON_CALL_ROLES.includes(r), r);
  // A Recruiter sees every branch; a Manager and a Supervisor only their own.
  assert.ok(ALL_BRANCH_ON_CALL_ROLES.includes("recruiter"));
  assert.ok(!ALL_BRANCH_ON_CALL_ROLES.includes("manager"));
  assert.ok(!ALL_BRANCH_ON_CALL_ROLES.includes("supervisor"));
});

test("Admins, the Registered roles and On Call always set the rota, whatever the switch", () => {
  for (const role of ["company_admin", "registered_individual", "registered_manager", "on_call", "platform_admin"]) {
    for (const scope of ["branch", "company"] as const) {
      assert.equal(canSetRota({ role, scope, hasBranch: true, rotaRoles: [] }), true, `${role} ${scope}`);
    }
  }
});

test("a Manager sets her branch rota and now the company rota (Phil, 2026-10-13)", () => {
  assert.equal(canSetRota({ role: "manager", scope: "branch", hasBranch: true, rotaRoles: [] }), true);
  assert.equal(canSetRota({ role: "manager", scope: "company", hasBranch: false, rotaRoles: [] }), true);
});

test("a Supervisor and a Recruiter set the rota only while their role is ticked", () => {
  for (const role of ["supervisor", "recruiter"]) {
    assert.equal(canSetRota({ role, scope: "branch", hasBranch: true, rotaRoles: ON }), true, role);
    assert.equal(canSetRota({ role, scope: "company", hasBranch: false, rotaRoles: ON }), true, role);
    assert.equal(canSetRota({ role, scope: "branch", hasBranch: true, rotaRoles: [] }), false, role);
    assert.equal(canSetRota({ role, scope: "company", hasBranch: false, rotaRoles: [] }), false, role);
  }
  // Each role has its own tick.
  assert.equal(canSetRota({ role: "supervisor", scope: "company", hasBranch: false, rotaRoles: ["recruiter"] }), false);
  assert.equal(canSetRota({ role: "recruiter", scope: "company", hasBranch: false, rotaRoles: ["recruiter"] }), true);
});

test("a branch rota with no branch of theirs offers nothing to set", () => {
  assert.equal(canSetRota({ role: "manager", scope: "branch", hasBranch: false, rotaRoles: ON }), false);
  assert.equal(canSetRota({ role: "company_admin", scope: "branch", hasBranch: false, rotaRoles: ON }), false);
});

test("Seniors, Viewers and carers never set the rota", () => {
  for (const role of ["senior", "team_member", "staff"]) {
    assert.equal(canSetRota({ role, scope: "branch", hasBranch: true, rotaRoles: ON }), false, role);
    assert.equal(canSetRota({ role, scope: "company", hasBranch: false, rotaRoles: [...ON, role] }), false, role);
  }
});

test("who can be on call: On Call, Supervisors and above, never a carer, Senior or Viewer", () => {
  for (const r of ["company_admin", "registered_individual", "registered_manager", "manager", "supervisor", "recruiter", "on_call"]) {
    assert.ok(ON_CALL_PERSON_ROLES.includes(r), r);
  }
  for (const r of ["staff", "senior", "team_member", "platform_admin"]) assert.ok(!ON_CALL_PERSON_ROLES.includes(r), r);
});
