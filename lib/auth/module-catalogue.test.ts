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

test("a carer's own login reaches the Team Portal and nothing else", () => {
  /* `staff` has one destination. Everything else is closed to them by RLS as well as by the nav,
     and this must not be the thing that opens one. The Portal itself became a department on
     2026-09-17 so a company can switch it off. */
  assert.equal(canUseModule("team_portal", "staff"), true);
  for (const m of MODULES) {
    if (m.key === "team_portal") continue;
    assert.equal(canUseModule(m.key, "staff"), false, `staff must not reach ${m.key}`);
  }
});

test("nobody but a carer reaches the Team Portal", () => {
  for (const role of ["company_admin", "registered_manager", "manager", "supervisor", "team_member", "on_call"]) {
    assert.equal(canUseModule("team_portal", role), false, `${role} must not reach the Team Portal`);
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
    "manager", "supervisor", "recruiter", "team_member", "on_call", "staff",
  ]);
  for (const m of MODULES) {
    assert.ok(m.roles.length > 0, `${m.key} has an empty ceiling`);
    for (const r of m.roles) assert.ok(known.has(r), `${m.key} names an unknown role: ${r}`);
  }
});

/*
 * THE SAVE, as the action computes it: the form posts the ticks that are ON, and the OFF rows are
 * what is left of the ceiling. Worked out here rather than trusted from the form, because a form
 * that posted the off list would, on a dropped field, quietly switch a department ON for a role.
 */
function offRowsFor(role: string, ticked: string[]): string[] {
  const on = new Set(ticked);
  return MODULES
    .filter((m) => m.roles.includes(role) && !isLocked(m.key, role) && !on.has(m.key))
    .map((m) => m.key);
}

test("saving with everything ticked stores nothing at all", () => {
  const all = MODULES.filter((m) => m.roles.includes("manager")).map((m) => m.key);
  assert.deepEqual(offRowsFor("manager", all), []);
});

test("saving with one unticked stores exactly that one", () => {
  const all = MODULES.filter((m) => m.roles.includes("supervisor")).map((m) => m.key);
  const off = offRowsFor("supervisor", all.filter((k) => k !== "incidents"));
  assert.deepEqual(off, ["incidents"]);
  assert.equal(canUseModule("incidents", "supervisor", asDisabled("supervisor", off)), false);
  assert.equal(canUseModule("complaints", "supervisor", asDisabled("supervisor", off)), true);
});

/* TWO SHAPES, and they are easy to confuse: the action works in module KEYS, the runtime check
   works in `role|module` pairs. Writing this test the wrong way round was the first thing it
   caught, so the conversion lives here rather than being done by hand in each assertion. */
const asDisabled = (role: string, keys: string[]) => new Set(keys.map((k) => disabledKey(role, k)));

test("a tick outside the ceiling cannot widen anything", () => {
  // A stale page, or somebody poking at the form. Invoicing is not in a Supervisor's ceiling, so
  // ticking it neither stores anything nor grants anything.
  const off = offRowsFor("supervisor", ["invoicing"]);
  assert.ok(!off.includes("invoicing"));
  assert.equal(canUseModule("invoicing", "supervisor", asDisabled("supervisor", off)), false);
});

test("an empty post switches everything off, and Settings survives it", () => {
  // The Admin tile with every box cleared: Settings is locked, so it is not in the off list and
  // canUseModule still lets them back in.
  const off = offRowsFor("company_admin", []);
  assert.ok(!off.includes("settings"));
  assert.equal(canUseModule("settings", "company_admin", asDisabled("company_admin", off)), true);
  assert.equal(canUseModule("people", "company_admin", asDisabled("company_admin", off)), false);
});

test("On Call reaches the Dashboard, because the follow ups they raise are shown there", () => {
  /* Phil, 2026-09-17: "when 'needs urgent follow up' is ticked, it goes to on call and above on
     the dash". The role that raises them was the one role that could not see them: the page
     redirected On Call away and the panel was gated on manager and above. */
  assert.equal(canUseModule("dashboard", "on_call"), true);
  // Still nothing else. The Dashboard's other panels are gated on companyWide, which On Call is
  // not, so widening this one department does not hand them the compliance score.
  for (const key of ["people", "service_users", "training", "invoicing", "reports", "settings"]) {
    assert.equal(canUseModule(key, "on_call"), false, `On Call must not reach ${key}`);
  }
});
