import test from "node:test";
import assert from "node:assert/strict";
import { REG_REPORT_REFUSED, canEditRegReport, canViewRegReport } from "./roles.ts";

test("the company wide roles and the Founder see and edit the reports", () => {
  for (const role of ["platform_admin", "company_admin", "registered_individual", "registered_manager"]) {
    assert.equal(canViewRegReport(role), true, role);
    assert.equal(canEditRegReport(role), true, role);
  }
});

test("a Branch Manager views but never edits", () => {
  assert.equal(canViewRegReport("manager"), true);
  assert.equal(canEditRegReport("manager"), false);
});

test("nobody else sees them (Phil, 11 Oct 2026, audit F16)", () => {
  for (const role of ["supervisor", "recruiter", "senior", "staff", "team_member", "on_call", "", "unknown"]) {
    assert.equal(canViewRegReport(role), false, role);
    assert.equal(canEditRegReport(role), false, role);
  }
});

test("the refusal is plain words with no dashes", () => {
  assert.doesNotMatch(REG_REPORT_REFUSED, /[—–]| - /);
});
