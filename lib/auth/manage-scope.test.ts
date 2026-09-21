import { test } from "node:test";
import assert from "node:assert/strict";
import {
  branchScopedRole,
  branchSummary,
  canManageAnything,
  canManageRecord,
  isCompanyWideRole,
  mayConductInBranch, canRecordTraining, canRecordTrainingAnywhere } from "./manage-scope.ts";

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
  for (const role of ["on_call", "viewer", "team_member"]) {
    assert.equal(canManageRecord({ role, branchIds: [CARDIFF], recordBranchId: CARDIFF }), false, role);
  }
  // A SUPERVISOR runs her own branch since 0309 (is_branch_lead), and only her own.
  assert.equal(canManageRecord({ role: "supervisor", branchIds: [CARDIFF], recordBranchId: CARDIFF }), true);
  assert.equal(canManageRecord({ role: "supervisor", branchIds: [CARDIFF], recordBranchId: NEWPORT }), false);
  assert.equal(canManageRecord({ role: "supervisor", branchIds: [CARDIFF], recordBranchId: null }), false);
});

test("an unknown role is refused rather than allowed", () => {
  assert.equal(canManageRecord({ role: "", branchIds: [CARDIFF], recordBranchId: CARDIFF }), false);
  assert.equal(canManageRecord({ role: "auditor", branchIds: [CARDIFF], recordBranchId: CARDIFF }), false);
});

test("the coarse check is for pages and toolbars, and agrees with the per record one", () => {
  for (const role of ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager", "supervisor"]) {
    assert.equal(canManageAnything(role), true, role);
  }
  for (const role of ["on_call", "viewer", "team_member", "auditor"]) {
    assert.equal(canManageAnything(role), false, role);
  }
  // Anyone the coarse check refuses must be refused per record too, or a page would open and
  // then deny every control on it.
  for (const role of ["on_call", "viewer", "team_member", "auditor"]) {
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
    assert.equal(inside, true, `${role} inside`);
  }
});

test("a SUPERVISOR may conduct in their own branch, and since 0309 manages the records there too", () => {
  /*
   * The reason booking is a separate rule. planner_bookings_insert ORs in is_branch_supervisor,
   * which people_update does not, so reusing canManageRecord here would hide a control from
   * somebody the database would have allowed.
   */
  assert.equal(
    mayConductInBranch({ role: "supervisor", branchIds: [CARDIFF], recordBranchId: CARDIFF }),
    true,
  );
  assert.equal(
    canManageRecord({ role: "supervisor", branchIds: [CARDIFF], recordBranchId: CARDIFF }),
    true,
  );
  // And not one branch further, which is the point of both rules.
  assert.equal(
    canManageRecord({ role: "supervisor", branchIds: [CARDIFF], recordBranchId: CAERPHILLY }),
    false,
  );
});

test("nobody may put THEMSELVES down for a record in a branch they do not run", () => {
  for (const role of ["manager", "supervisor"]) {
    assert.equal(
      mayConductInBranch({ role, branchIds: [CARDIFF, NEWPORT], recordBranchId: CAERPHILLY }),
      false,
      role,
    );
    assert.equal(mayConductInBranch({ role, branchIds: [CARDIFF], recordBranchId: null }), false, role);
  }
  // And the roles that are in neither clause of the insert policy.
  for (const role of ["on_call", "viewer", "team_member", "auditor"]) {
    assert.equal(mayConductInBranch({ role, branchIds: [CARDIFF], recordBranchId: CARDIFF }), false, role);
  }
});

test("the company wide roles may conduct anywhere, matching is_branch_manager's is_company_wide clause", () => {
  for (const role of ["platform_admin", "company_admin", "registered_individual", "registered_manager"]) {
    assert.equal(mayConductInBranch({ role, branchIds: [], recordBranchId: CAERPHILLY }), true, role);
  }
});

/* ------------------------------------------------------------------------- *
 * branchSummary — what the Users screen says about somebody's branches.
 * Phil, 2026-09-04: six pending invites all read "no branch", and not one of
 * them had no branch.
 * ------------------------------------------------------------------------- */

test("THE DEFECT: a supervisor invited with All branches read 'no branch'", () => {
  // Lucy, Chloe, Lauren and Hayley: a user_branches row for all three Thistle branches.
  assert.equal(
    branchSummary({
      role: "supervisor",
      branchNames: ["Cardiff", "Newport", "Thistle Care Ltd Office"],
      activeBranchCount: 3,
    }),
    "All branches",
  );
});

test("THE OTHER HALF: every company wide role says All branches, not just the Admin", () => {
  for (const role of ["company_admin", "registered_individual", "registered_manager", "platform_admin"]) {
    assert.equal(
      branchSummary({ role, branchNames: [], activeBranchCount: 3 }),
      "All branches",
      role,
    );
  }
});

test("a scoped role with some of the branches is listed, not summarised", () => {
  assert.equal(
    branchSummary({ role: "supervisor", branchNames: ["Cardiff", "Newport"], activeBranchCount: 3 }),
    "Cardiff, Newport",
  );
  assert.equal(
    branchSummary({ role: "manager", branchNames: ["Cardiff"], activeBranchCount: 3 }),
    "Cardiff",
  );
});

test("a scoped role with genuinely no branch still says so", () => {
  assert.equal(
    branchSummary({ role: "supervisor", branchNames: [], activeBranchCount: 3 }),
    "No branch",
  );
});

test("one branch company: the only branch IS all branches", () => {
  assert.equal(
    branchSummary({ role: "manager", branchNames: ["Swansea"], activeBranchCount: 1 }),
    "All branches",
  );
});

test("a count of zero never turns an empty list into All branches", () => {
  assert.equal(
    branchSummary({ role: "supervisor", branchNames: [], activeBranchCount: 0 }),
    "No branch",
  );
});

test("isCompanyWideRole matches the policy's is_company_wide, and nothing else", () => {
  assert.equal(isCompanyWideRole("registered_manager"), true);
  assert.equal(isCompanyWideRole("registered_individual"), true);
  assert.equal(isCompanyWideRole("company_admin"), true);
  assert.equal(isCompanyWideRole("manager"), false);
  assert.equal(isCompanyWideRole("supervisor"), false);
  assert.equal(isCompanyWideRole("staff"), false);
});

/*
 * TRAINING IS A DIFFERENT POLICY (Phil, 2026-09-17): "we have given supervisors access to
 * training but they cant change anything or enter any training?" 0289 widened the read and
 * nobody widened the write, so a Supervisor got a register she could look at and not touch.
 */
test("a Supervisor records training in her own branches", () => {
  assert.equal(
    canRecordTraining({ role: "supervisor", branchIds: ["cardiff"], recordBranchId: "cardiff" }),
    true,
  );
  assert.equal(
    canRecordTraining({ role: "supervisor", branchIds: ["cardiff"], recordBranchId: "newport" }),
    false,
  );
});

test("training and the record are still two policies, and both now reach a Supervisor", () => {
  /* They were written apart because they said different things: 0294 gave a Supervisor training
     and nothing else, so one boolean could not answer both. 0309 gave her the record in her own
     branch as well, and they now agree there -- but they are still two transcriptions of two
     policies, and the day one changes is the day that matters. */
  const her = { role: "supervisor", branchIds: ["cardiff"], recordBranchId: "cardiff" };
  assert.equal(canRecordTraining(her), true);
  assert.equal(canManageRecord(her), true);

  // Another branch: both refuse, for the same reason in two different policies.
  const elsewhere = { role: "supervisor", branchIds: ["cardiff"], recordBranchId: "newport" };
  assert.equal(canRecordTraining(elsewhere), false);
  assert.equal(canManageRecord(elsewhere), false);
});

test("a carer with no branch is refused, for a Supervisor as for a Manager", () => {
  // A row with no branch cannot match is_branch_supervisor, so offering the cell would repeat
  // exactly the lie this module exists to stop.
  assert.equal(
    canRecordTraining({ role: "supervisor", branchIds: ["cardiff"], recordBranchId: null }),
    false,
  );
});

test("company wide roles record training anywhere, a Viewer nowhere", () => {
  for (const role of ["company_admin", "registered_individual", "registered_manager", "platform_admin"]) {
    assert.equal(canRecordTraining({ role, branchIds: [], recordBranchId: null }), true);
    assert.equal(canRecordTrainingAnywhere(role), true);
  }
  for (const role of ["team_member", "on_call", "staff"]) {
    assert.equal(canRecordTraining({ role, branchIds: ["cardiff"], recordBranchId: "cardiff" }), false);
    assert.equal(canRecordTrainingAnywhere(role), false);
  }
});
