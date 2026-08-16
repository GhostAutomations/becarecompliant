import { test } from "node:test";
import assert from "node:assert/strict";
import { canManageRecord, canManageAnything, branchScopedRole, canBookInBranch } from "./manage-scope.ts";

/**
 * These tests are the contract between this file and the RLS policy it transcribes. If a policy
 * changes and these still pass, one of the two is now lying to a manager.
 */

const CARDIFF = "b-cardiff";
const NEWPORT = "b-newport";
const CAERPHILLY = "b-caerphilly";

test("a manager can manage a record in her own branch", () => {
  assert.equal(
    canManageRecord({ role: "manager", branchIds: [CARDIFF, NEWPORT], recordBranchId: CARDIFF }),
    true,
  );
});

test("THE CASE THAT MADE THIS REAL: a manager cannot manage a record in a branch she does not run", () => {
  /*
   * Tim Mingle runs Cardiff1 and Newport1. Migration 0183 lets him SEE a carer in Caerphilly
   * because he is booked to conduct her supervision. people_update will refuse every write, so
   * the screen must not offer him one.
   */
  assert.equal(
    canManageRecord({ role: "manager", branchIds: [CARDIFF, NEWPORT], recordBranchId: CAERPHILLY }),
    false,
  );
});

test("a record with no branch is refused for a manager rather than assumed", () => {
  // is_branch_manager needs a branch to match on, so there is no way for this write to succeed.
  assert.equal(canManageRecord({ role: "manager", branchIds: [CARDIFF], recordBranchId: null }), false);
  assert.equal(canManageRecord({ role: "manager", branchIds: [CARDIFF], recordBranchId: undefined }), false);
  assert.equal(canManageRecord({ role: "manager", branchIds: [], recordBranchId: CARDIFF }), false);
});

test("the company wide roles reach every branch, and a missing branch does not stop them", () => {
  // is_branch_manager ORs in is_company_wide, which does not look at user_branches at all.
  for (const role of ["platform_admin", "company_admin", "registered_individual", "registered_manager"]) {
    assert.equal(canManageRecord({ role, branchIds: [], recordBranchId: CAERPHILLY }), true, role);
    assert.equal(canManageRecord({ role, branchIds: [], recordBranchId: null }), true, role);
  }
});

test("the roles that can SEE more than they can WRITE are refused", () => {
  /*
   * Every one of these appears in people_select and in NONE of people_update's clauses. A
   * supervisor reads her whole branch (0078), on call reads the whole company, a viewer reads
   * their branch, a team member reads their own record. Not one of them may write.
   */
  for (const role of ["supervisor", "on_call", "viewer", "team_member"]) {
    assert.equal(canManageRecord({ role, branchIds: [CARDIFF], recordBranchId: CARDIFF }), false, role);
  }
});

test("an unknown role is refused rather than allowed", () => {
  assert.equal(canManageRecord({ role: "", branchIds: [CARDIFF], recordBranchId: CARDIFF }), false);
  assert.equal(canManageRecord({ role: "auditor", branchIds: [CARDIFF], recordBranchId: CARDIFF }), false);
});

test("the coarse check is for pages and toolbars, and agrees with the per record one", () => {
  for (const role of ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"]) {
    assert.equal(canManageAnything(role), true, role);
  }
  for (const role of ["supervisor", "on_call", "viewer", "team_member", "auditor"]) {
    assert.equal(canManageAnything(role), false, role);
  }
  // Anyone the coarse check refuses must be refused per record too, or a page would open and
  // then deny every control on it.
  for (const role of ["supervisor", "on_call", "viewer", "team_member", "auditor"]) {
    assert.equal(canManageRecord({ role, branchIds: [CARDIFF], recordBranchId: CARDIFF }), false, role);
  }
});

test("only the roles the database confines to a branch have their branch list narrowed", () => {
  // is_branch_manager joins user_branches; is_person_supervisor has done the same since 0078.
  assert.equal(branchScopedRole("manager"), true);
  assert.equal(branchScopedRole("supervisor"), true);

  // On Call reads the WHOLE company (is_company_on_call), so narrowing would take away branches
  // they can genuinely reach. The company wide roles are unaffected by definition.
  for (const role of ["on_call", "platform_admin", "company_admin", "registered_individual", "registered_manager"]) {
    assert.equal(branchScopedRole(role), false, role);
  }
});

test("anyone whose branch list is narrowed can only manage inside those branches", () => {
  // The two rules have to agree, or a manager is offered a branch she cannot write to, or
  // refused one she can.
  const branchIds = ["b-cardiff"];
  for (const role of ["manager", "supervisor"]) {
    const inside = canManageRecord({ role, branchIds, recordBranchId: "b-cardiff" });
    const outside = canManageRecord({ role, branchIds, recordBranchId: "b-caerphilly" });
    assert.equal(outside, false, `${role} outside`);
    // A supervisor manages nothing at all, which is stricter, never looser.
    if (role === "manager") assert.equal(inside, true);
  }
});

test("a SUPERVISOR may book in their own branch even though they may not manage the record", () => {
  /*
   * The reason booking is a separate rule. planner_bookings_insert ORs in is_branch_supervisor,
   * which people_update does not, so reusing canManageRecord here would hide a control from
   * somebody the database would have allowed.
   */
  assert.equal(
    canBookInBranch({ role: "supervisor", branchIds: [CARDIFF], recordBranchId: CARDIFF }),
    true,
  );
  assert.equal(
    canManageRecord({ role: "supervisor", branchIds: [CARDIFF], recordBranchId: CARDIFF }),
    false,
  );
});

test("nobody may book against a record in a branch they do not run", () => {
  for (const role of ["manager", "supervisor"]) {
    assert.equal(
      canBookInBranch({ role, branchIds: [CARDIFF, NEWPORT], recordBranchId: CAERPHILLY }),
      false,
      role,
    );
    assert.equal(canBookInBranch({ role, branchIds: [CARDIFF], recordBranchId: null }), false, role);
  }
  // And the roles that are in neither clause of the insert policy.
  for (const role of ["on_call", "viewer", "team_member", "auditor"]) {
    assert.equal(canBookInBranch({ role, branchIds: [CARDIFF], recordBranchId: CARDIFF }), false, role);
  }
});

test("the company wide roles may book anywhere, matching is_branch_manager's is_company_wide clause", () => {
  for (const role of ["platform_admin", "company_admin", "registered_individual", "registered_manager"]) {
    assert.equal(canBookInBranch({ role, branchIds: [], recordBranchId: CAERPHILLY }), true, role);
  }
});
