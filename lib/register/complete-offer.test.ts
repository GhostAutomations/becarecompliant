import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkCompleteRefusal,
  mayOfferCheckComplete,
  completeRefusedText,
  COMPLETE_REFUSED_TEXT,
  CHECK_COMPLETE_ROLES,
} from "./complete-offer.ts";

const other = { ownRecord: false, bookedForThisCheck: false };

test("the office roles are offered Complete on someone else's record", () => {
  for (const role of CHECK_COMPLETE_ROLES) {
    assert.equal(checkCompleteRefusal({ role, ...other }), null, role);
  }
});

test("nobody, whatever their role, completes a check on their own record", () => {
  for (const role of [...CHECK_COMPLETE_ROLES, "recruiter", "team_member"]) {
    assert.equal(checkCompleteRefusal({ role, ownRecord: true, bookedForThisCheck: true }), "own_record", role);
  }
});

test("a Recruiter only for the check they are booked on the Planner to do", () => {
  assert.equal(checkCompleteRefusal({ role: "recruiter", ownRecord: false, bookedForThisCheck: false }), "not_booked");
  assert.equal(checkCompleteRefusal({ role: "recruiter", ownRecord: false, bookedForThisCheck: true }), null);
  assert.equal(mayOfferCheckComplete({ role: "recruiter", ownRecord: false, bookedForThisCheck: true }), true);
});

test("On Call, Viewers and carers are not offered Complete, booked or not", () => {
  for (const role of ["on_call", "viewer", "team_member"]) {
    assert.equal(checkCompleteRefusal({ role, ownRecord: false, bookedForThisCheck: true }), "role", role);
    assert.equal(mayOfferCheckComplete({ role, ownRecord: false, bookedForThisCheck: true }), false, role);
  }
});

test("the record's banner only shows our own words, never what the link carried", () => {
  assert.equal(completeRefusedText("own_record"), COMPLETE_REFUSED_TEXT.own_record);
  assert.equal(completeRefusedText("not_booked"), COMPLETE_REFUSED_TEXT.not_booked);
  assert.equal(completeRefusedText("role"), COMPLETE_REFUSED_TEXT.role);
  assert.equal(completeRefusedText("Click here"), null);
  assert.equal(completeRefusedText(undefined), null);
});

test("no dashes as punctuation in the words shown", () => {
  for (const text of Object.values(COMPLETE_REFUSED_TEXT)) {
    assert.doesNotMatch(text, /\s[-–—]\s/);
  }
});
