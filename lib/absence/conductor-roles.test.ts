import { test } from "node:test";
import assert from "node:assert/strict";
import { mayHoldMeeting } from "./conductor-roles.ts";

test("managers always hold meetings; a Supervisor while Absence is ticked", () => {
  const none = new Set<string>();
  for (const r of ["company_admin", "registered_individual", "registered_manager", "manager", "supervisor"]) {
    assert.equal(mayHoldMeeting(r, none), true, r);
  }
  for (const r of ["team_member", "senior", "staff", "platform_admin", "recruiter", "on_call", "", null]) {
    assert.equal(mayHoldMeeting(r, none), false, String(r));
  }
  const off = new Set(["supervisor|absence", "manager|absence"]);
  assert.equal(mayHoldMeeting("supervisor", off), false);
  assert.equal(mayHoldMeeting("recruiter", off), false);
  assert.equal(mayHoldMeeting("manager", off), true);
});
