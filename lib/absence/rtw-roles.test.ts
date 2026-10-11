import { test } from "node:test";
import assert from "node:assert/strict";
import { RTW_ROLES, RTW_ROLE_REFUSAL, canRecordReturnToWork } from "./rtw-roles.ts";

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
