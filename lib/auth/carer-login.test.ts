import { test } from "node:test";
import assert from "node:assert/strict";
import { isCarerLogin, seniorPathRedirect } from "./carer-login.ts";
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
