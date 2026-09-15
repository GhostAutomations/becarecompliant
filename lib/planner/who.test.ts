import test from "node:test";
import assert from "node:assert/strict";
import { plannerWho, whoParam, filterToWho, canViewIndividuals } from "./who.ts";

const ME = "me-1";
const REBECCA = "reb-2";
const OTHER = "oth-3";
const ALLOWED = [ME, REBECCA, OTHER];

test("no parameter means MINE, which is the whole point of the change", () => {
  assert.deepEqual(plannerWho(undefined, ME, "company_admin", ALLOWED), { kind: "mine" });
  assert.deepEqual(plannerWho(null, ME, "company_admin", ALLOWED), { kind: "mine" });
  assert.deepEqual(plannerWho("", ME, "company_admin", ALLOWED), { kind: "mine" });
  assert.deepEqual(plannerWho("   ", ME, "company_admin", ALLOWED), { kind: "mine" });
});

test("everybody's calendar is now the thing you ask for", () => {
  assert.deepEqual(plannerWho("all", ME, "manager", ALLOWED), { kind: "all" });
  assert.deepEqual(plannerWho("mine", ME, "manager", ALLOWED), { kind: "mine" });
});

test("the senior roles can single out one colleague", () => {
  for (const role of ["platform_admin", "company_admin", "registered_individual", "registered_manager"]) {
    assert.deepEqual(plannerWho(REBECCA, ME, role, ALLOWED), { kind: "person", personId: REBECCA }, role);
    assert.equal(canViewIndividuals(role), true, role);
  }
});

test("a manager or supervisor cannot, and a hand-edited URL quietly falls back to mine", () => {
  for (const role of ["manager", "supervisor", "team_member", "on_call", "staff"]) {
    assert.deepEqual(plannerWho(REBECCA, ME, role, ALLOWED), { kind: "mine" }, role);
    assert.equal(canViewIndividuals(role), false, role);
  }
});

test("an id that is not a conductor in this company is not a selection", () => {
  assert.deepEqual(plannerWho("someone-elses-company", ME, "company_admin", ALLOWED), { kind: "mine" });
  assert.deepEqual(plannerWho("../../etc/passwd", ME, "company_admin", ALLOWED), { kind: "mine" });
});

test("choosing yourself from the list is the same as My calendar, so the controls agree", () => {
  assert.deepEqual(plannerWho(ME, ME, "company_admin", ALLOWED), { kind: "mine" });
});

test("a link reproduces the selection, and mine carries no parameter", () => {
  assert.equal(whoParam({ kind: "mine" }), null);
  assert.equal(whoParam({ kind: "all" }), "all");
  assert.equal(whoParam({ kind: "person", personId: REBECCA }), REBECCA);
});

test("filtering keeps exactly the calendar asked for", () => {
  const rows = [
    { conductorId: ME, id: "a" },
    { conductorId: REBECCA, id: "b" },
    { conductorId: OTHER, id: "c" },
    { conductorId: REBECCA, id: "d" },
  ];
  assert.deepEqual(filterToWho(rows, { kind: "all" }, ME).map((r) => r.id), ["a", "b", "c", "d"]);
  assert.deepEqual(filterToWho(rows, { kind: "mine" }, ME).map((r) => r.id), ["a"]);
  assert.deepEqual(
    filterToWho(rows, { kind: "person", personId: REBECCA }, ME).map((r) => r.id),
    ["b", "d"],
  );
});

test("filtering never invents rows: it only ever narrows what RLS already allowed", () => {
  const rows = [{ conductorId: ME, id: "a" }];
  assert.equal(filterToWho(rows, { kind: "person", personId: REBECCA }, ME).length, 0);
  assert.ok(filterToWho(rows, { kind: "all" }, ME).length <= rows.length);
});

test("filtering does not mutate what it was given", () => {
  const rows = [{ conductorId: ME, id: "a" }, { conductorId: REBECCA, id: "b" }];
  filterToWho(rows, { kind: "mine" }, ME);
  assert.equal(rows.length, 2);
});
