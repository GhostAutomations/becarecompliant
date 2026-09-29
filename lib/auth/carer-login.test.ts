import { test } from "node:test";
import assert from "node:assert/strict";
import { isCarerLogin, seniorListAfter, seniorPathRedirect } from "./carer-login.ts";
import { canUseModule, withinCeiling } from "./module-catalogue.ts";

test("staff and senior are carer logins, nobody else is", () => {
  assert.equal(isCarerLogin("staff"), true);
  assert.equal(isCarerLogin("senior"), true);
  for (const r of ["supervisor", "team_member", "manager", "company_admin", "on_call", null, undefined]) {
    assert.equal(isCarerLogin(r as string), false, String(r));
  }
});

test("a Senior only ever has the two name lists and their own area", () => {
  assert.equal(withinCeiling("people", "senior"), true);
  assert.equal(withinCeiling("service_users", "senior"), true);
  assert.equal(withinCeiling("team_portal", "senior"), true);
  for (const k of ["dashboard", "training", "holiday", "absence", "complaints", "incidents", "whistleblowing", "briefings", "on_call", "planner", "invoicing", "readiness", "reports", "settings"]) {
    assert.equal(withinCeiling(k, "senior"), false, k);
  }
  assert.equal(canUseModule("service_users", "senior", new Set(["senior|service_users"])), false);
  assert.equal(canUseModule("people", "senior", new Set(["senior|service_users"])), true);
});

test("anything below the two lists sends a Senior back to the list", () => {
  assert.equal(seniorPathRedirect("/people/123"), "/people");
  assert.equal(seniorPathRedirect("/people/summary"), "/people");
  assert.equal(seniorPathRedirect("/service-users/abc/care-plan"), "/service-users");
  assert.equal(seniorPathRedirect("/people"), null);
  assert.equal(seniorPathRedirect("/service-users"), null);
  assert.equal(seniorPathRedirect("/my"), null);
  assert.equal(seniorPathRedirect("/peoplex"), null);
});

test("a Senior may open the Complete page of a Check, and nothing else below the lists", () => {
  const p = "11111111-2222-3333-4444-555555555555";
  const i = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  assert.equal(seniorPathRedirect(`/people/${p}/checks/${i}/complete`), null);
  assert.equal(seniorPathRedirect(`/service-users/${p}/checks/${i}/complete`), null);
  assert.equal(seniorPathRedirect(`/people/${p}/checks/${i}`), "/people");
  assert.equal(seniorPathRedirect(`/people/${p}/tracker/probation/complete`), "/people");
  assert.equal(seniorPathRedirect(`/people/${p}/checks/${i}/complete/extra`), "/people");
  assert.equal(seniorPathRedirect(`/people/not-an-id/checks/${i}/complete`), "/people");
});

test("after completing, a Senior goes back to their list with the outcome", () => {
  assert.equal(seniorListAfter("people", "completed", "Spot Check"), "/people?completed=Spot%20Check");
  assert.equal(seniorListAfter("service_users", "history", "Care Plan Review"), "/service-users?history=Care%20Plan%20Review");
});
