import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MODULES,
  canUseModule,
  disabledKey,
  isLocked,
  withinCeiling,
} from "./module-catalogue.ts";
import { COMPLAINTS_ROLES, INCIDENTS_ROLES } from "./module-roles.ts";

test("absence means ON, so a new department is not silently off everywhere", () => {
  // The alternative, a row per allowed pair, means every company that existed before a department
  // shipped has it switched off until somebody notices. Only a deliberate switch off is stored.
  assert.equal(canUseModule("complaints", "supervisor"), true);
  assert.equal(canUseModule("complaints", "supervisor", new Set()), true);
});

test("a company can switch a department off for one role without touching the others", () => {
  const off = new Set([disabledKey("supervisor", "complaints")]);
  assert.equal(canUseModule("complaints", "supervisor", off), false);
  assert.equal(canUseModule("complaints", "manager", off), true);
  assert.equal(canUseModule("incidents", "supervisor", off), true);
});

test("a tick can never reach past the ceiling", () => {
  /* The whole reason RLS does not have to be rewritten: the policies stay the backstop and the
     ticks only narrow beneath them. Switching a role ON outside its ceiling is not expressible. */
  assert.equal(withinCeiling("invoicing", "supervisor"), false);
  assert.equal(canUseModule("invoicing", "supervisor"), false);
  assert.equal(canUseModule("invoicing", "supervisor", new Set()), false);
  assert.equal(canUseModule("invoicing", "team_member"), false);
});

test("an Admin cannot be locked out of Settings", () => {
  // The first person to untick their own Settings would have no way back into any setting,
  // including this one, and getting back would be a support request with a SQL console.
  const off = new Set([disabledKey("company_admin", "settings")]);
  assert.equal(isLocked("settings", "company_admin"), true);
  assert.equal(canUseModule("settings", "company_admin", off), true);
});

test("Settings is not offered to anybody else at all", () => {
  for (const role of ["manager", "supervisor", "team_member", "on_call", "staff"]) {
    assert.equal(withinCeiling("settings", role), false, `${role} must not reach Settings`);
  }
});

test("an unknown department, or an unknown role, is refused rather than allowed", () => {
  assert.equal(canUseModule("payroll", "company_admin"), false);
  assert.equal(canUseModule("complaints", "auditor"), false);
});

test("a carer's own login reaches no department here", () => {
  // `staff` has one destination, /my, and it is not a department. Everything else is closed to
  // them by RLS as well as by the nav, and this must not be the thing that opens one.
  for (const m of MODULES) {
    assert.equal(canUseModule(m.key, "staff"), false, `staff must not reach ${m.key}`);
  }
});

test("the ceiling matches the role lists the pages and actions already use", () => {
  /* The two files must not drift: module-roles.ts is what thirteen call sites import today, and
     this catalogue is what the settings screen will show. If one gains a role and the other does
     not, a company would tick a department the pages still refuse. */
  const ceiling = (key: string) => MODULES.find((m) => m.key === key)!.roles;
  assert.deepEqual([...ceiling("complaints")].sort(), [...COMPLAINTS_ROLES].sort());
  assert.deepEqual([...ceiling("incidents")].sort(), [...INCIDENTS_ROLES].sort());
});

test("every module key is unique and every ceiling names real roles", () => {
  const keys = MODULES.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length, "two modules share a key");
  const known = new Set([
    "platform_admin", "company_admin", "registered_individual", "registered_manager",
    "manager", "supervisor", "team_member", "on_call", "staff",
  ]);
  for (const m of MODULES) {
    assert.ok(m.roles.length > 0, `${m.key} has an empty ceiling`);
    for (const r of m.roles) assert.ok(known.has(r), `${m.key} names an unknown role: ${r}`);
  }
});
