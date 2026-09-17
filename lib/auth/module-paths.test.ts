import { test } from "node:test";
import assert from "node:assert/strict";
import { moduleForPath, NO_ACCESS_PATH } from "./module-paths.ts";
import { MODULES } from "./module-catalogue.ts";

test("the longest prefix wins, so a sub department is not swallowed by its parent", () => {
  assert.equal(moduleForPath("/people"), "people");
  assert.equal(moduleForPath("/people/summary"), "people");
  assert.equal(moduleForPath("/people/training"), "training");
  assert.equal(moduleForPath("/people/holiday"), "holiday");
  assert.equal(moduleForPath("/people/absence"), "absence");
  // A record under People is People, not whatever its own segment happens to be called.
  assert.equal(moduleForPath("/people/2f1c/complaints"), "people");
});

test("a deep page inside a department is still that department", () => {
  assert.equal(moduleForPath("/complaints/closed"), "complaints");
  assert.equal(moduleForPath("/complaints/abc/responses/def"), "complaints");
  assert.equal(moduleForPath("/invoicing/schedules/xyz"), "invoicing");
  assert.equal(moduleForPath("/on-call/log/new"), "on_call");
});

test("a prefix only matches on a segment boundary", () => {
  // Otherwise /peoples-champion, or a future /reports-archive, would be gated as the wrong thing.
  assert.equal(moduleForPath("/peoples-champion"), null);
  assert.equal(moduleForPath("/reportsomething"), null);
});

test("what is not a department is not gated", () => {
  /* A gate that guessed at these would lock people out of pages this feature was never asked to
     govern, and /no-access most of all: a gate that redirects into a gated page is a loop. */
  for (const p of ["/my", "/welcome", "/login", "/evidence/abc", "/api/reports/training", "/", NO_ACCESS_PATH]) {
    assert.equal(moduleForPath(p), null, `${p} must not be gated`);
  }
});

test("every department in the catalogue has a path, and every path a department", () => {
  // The two halves are useless apart: a department with no path can never be enforced, and a path
  // naming a department that does not exist would refuse everybody.
  const reachable = new Set(
    ["/dashboard", "/people", "/people/training", "/people/holiday", "/people/absence",
     "/service-users", "/complaints", "/incidents", "/whistleblowing", "/briefings",
     "/on-call", "/planner", "/invoicing", "/readiness", "/reports", "/settings"]
      .map((p) => moduleForPath(p)),
  );
  for (const m of MODULES) {
    assert.ok(reachable.has(m.key), `${m.key} has no path, so it can never be enforced`);
  }
  assert.equal(reachable.size, MODULES.length);
});
