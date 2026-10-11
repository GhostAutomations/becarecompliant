import test from "node:test";
import assert from "node:assert/strict";
import { FOUNDER_ADDRESS_REFUSAL, isFounderLogin } from "./invite-founder.ts";

test("audit F11: only the platform admin role is the Founder's login", () => {
  assert.equal(isFounderLogin("platform_admin"), true);
  for (const role of ["company_admin", "registered_individual", "manager", "supervisor", "staff", "team_member", "", null, undefined]) {
    assert.equal(isFounderLogin(role), false, String(role));
  }
});

test("the refusal says what to do, not whose login it is, and has no dashes", () => {
  assert.match(FOUNDER_ADDRESS_REFUSAL, /already has a Be Care Compliant login/);
  assert.match(FOUNDER_ADDRESS_REFUSAL, /use a different email address/);
  assert.doesNotMatch(FOUNDER_ADDRESS_REFUSAL, /Founder/i);
  assert.doesNotMatch(FOUNDER_ADDRESS_REFUSAL, / [-–—] /);
});
