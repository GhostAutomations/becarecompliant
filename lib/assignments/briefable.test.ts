import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files, so the module under test is reached this way. */
import { isBriefableFormKey, BRIEFABLE_FORM_KEYS } from "./briefable.ts";

test("the Holiday Request form may be briefed", () => {
  assert.equal(isBriefableFormKey("holiday_requests"), true);
});

// Every one of these is manager-conducted and would file self-marked evidence on a
// regulator's record if a carer could complete it about themselves.
for (const key of [
  "supervision",
  "annual_appraisal_acme",
  "audit",
  "spot_check",
  "probation_review",
  "mentoring",
  "dbs_renewal",
  "right_to_work",
  "return_to_work",
  "manual_handling_ca",
  "medication_ca",
  "absence_back_office",
  "absence_management_meeting",
  "policy_acknowledgement",
]) {
  test(`a manager-conducted form is refused: ${key}`, () => {
    assert.equal(isBriefableFormKey(key), false);
  });
}

test("an unknown or empty key is refused, so a new form is never briefable by accident", () => {
  assert.equal(isBriefableFormKey("some_new_form"), false);
  assert.equal(isBriefableFormKey(null), false);
  assert.equal(isBriefableFormKey(undefined), false);
  assert.equal(isBriefableFormKey(""), false);
});

test("the allowlist stays tiny on purpose", () => {
  assert.deepEqual([...BRIEFABLE_FORM_KEYS], ["holiday_requests"]);
});
