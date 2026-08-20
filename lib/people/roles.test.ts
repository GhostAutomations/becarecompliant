import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. roles.ts has no runtime imports for exactly this reason. */
import {
  canBeLineManager,
  isCompanyWideRole,
  picksABranch,
  mayChooseAllBranches,
  ALL_BRANCHES,
} from "./roles.ts";

test("a Registered Manager can be a line manager — they usually run every branch", () => {
  assert.equal(canBeLineManager("registered_manager"), true);
});

test("PHIL'S RULE: nobody reports into the Responsible Individual", () => {
  // They see everything and can conduct; they are not in anybody's reporting line.
  assert.equal(canBeLineManager("registered_individual"), false);
});

test("Admins and Branch Managers can be line managers; supervisors are assigned separately", () => {
  assert.equal(canBeLineManager("company_admin"), true);
  assert.equal(canBeLineManager("manager"), true);
  assert.equal(canBeLineManager("supervisor"), false);
});

test("carers, viewers and on-call are never line managers", () => {
  for (const role of ["staff", "team_member", "on_call"]) {
    assert.equal(canBeLineManager(role), false, role);
  }
});

test("PHIL'S CORRECTION: a Registered Manager picks a branch, because they may run just one", () => {
  // CIW registers a manager against a service; plenty of providers have one RM per service.
  assert.equal(picksABranch("registered_manager"), true);
  assert.equal(picksABranch("manager"), true);
  assert.equal(picksABranch("supervisor"), true);
  // The RI oversees the provider, and an Admin is the account holder.
  assert.equal(picksABranch("registered_individual"), false);
  assert.equal(picksABranch("company_admin"), false);
});

test("every role that picks a branch may CHOOSE all branches, and it is never the default", () => {
  // Phil, 2026-08-19: asked for it on the Registered Manager, then for every role.
  for (const role of ["registered_manager", "manager", "supervisor", "on_call", "team_member"]) {
    assert.equal(mayChooseAllBranches(role), true, role);
  }
  // The two that never pick a branch are not "offered" it — their field already says All.
  assert.equal(mayChooseAllBranches("company_admin"), false);
  assert.equal(mayChooseAllBranches("registered_individual"), false);
});

test("the all-branches value is not an empty string", () => {
  // An untouched required select posts "", and "chose all" must not look like "chose nothing".
  assert.equal(ALL_BRANCHES, "all");
  assert.notEqual(ALL_BRANCHES, "");
});

test("the company wide roles are the three the database treats as company wide", () => {
  // Mirrors is_company_wide: company_admin, registered_individual, registered_manager.
  assert.equal(isCompanyWideRole("company_admin"), true);
  assert.equal(isCompanyWideRole("registered_individual"), true);
  assert.equal(isCompanyWideRole("registered_manager"), true);
  assert.equal(isCompanyWideRole("manager"), false);
  assert.equal(isCompanyWideRole("supervisor"), false);
  assert.equal(isCompanyWideRole("staff"), false);
});
