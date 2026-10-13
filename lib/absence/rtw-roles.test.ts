import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RTW_ROLES,
  RTW_ROLE_REFUSAL,
  canCancelReturnToWork,
  canRecordReturnToWork,
  rtwCancelReasonProblem,
  rtwCounts,
} from "./rtw-roles.ts";

test("On Call does not hold a Return to Work interview (Phil, 11 Oct 2026)", () => {
  assert.equal(canRecordReturnToWork("on_call"), false);
});

test("the branch office does", () => {
  for (const role of ["company_admin", "registered_individual", "registered_manager", "manager", "supervisor", "recruiter"]) {
    assert.equal(canRecordReturnToWork(role), true, role);
  }
});

test("carers, Seniors, Viewers and a missing role do not", () => {
  for (const role of ["staff", "senior", "team_member", "", null, undefined]) {
    assert.equal(canRecordReturnToWork(role), false, String(role));
  }
});

test("the list never gains On Call by accident", () => {
  assert.ok(!RTW_ROLES.includes("on_call"));
});

test("the refusal is plain copy: no dashes as punctuation", () => {
  assert.ok(!/ [-–—] /.test(RTW_ROLE_REFUSAL));
});

test("only Managers and above cancel or reinstate a Return to Work (Phil, 13 Oct 2026)", () => {
  for (const role of ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"]) {
    assert.equal(canCancelReturnToWork(role), true, role);
  }
  for (const role of ["supervisor", "recruiter", "on_call", "team_member", "", null, undefined]) {
    assert.equal(canCancelReturnToWork(role as string), false, String(role));
  }
});

test("a cancel needs a reason", () => {
  assert.equal(rtwCancelReasonProblem(""), "Say why the Return to Work is being cancelled.");
  assert.equal(rtwCancelReasonProblem("  ab "), "Say why the Return to Work is being cancelled.");
  assert.equal(rtwCancelReasonProblem(null), "Say why the Return to Work is being cancelled.");
  assert.equal(rtwCancelReasonProblem("Backlog cleared"), null);
});

test("the folded heading counts overdue and due apart", () => {
  assert.deepEqual(rtwCounts([]), { overdue: 0, due: 0 });
  assert.deepEqual(rtwCounts([{ overdue: true }, { overdue: true }, { overdue: false }]), { overdue: 2, due: 1 });
});
