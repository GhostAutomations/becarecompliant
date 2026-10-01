import { test } from "node:test";
import assert from "node:assert/strict";
import { skippedKeys, showsColumn, columnsForCheck } from "./defaults.ts";

test("nothing is skipped when the list was never shown", () => {
  assert.deepEqual(skippedKeys(["a", "b"], [], [], false), []);
});

test("unticked keys are skipped, ticked kept", () => {
  assert.deepEqual(skippedKeys(["a", "b", "c"], ["a", "c"], [], true), ["b"]);
});

test("a locked key is never skipped even if missing from the form", () => {
  assert.deepEqual(skippedKeys(["supervision", "spot_check"], [], ["supervision"], true), ["spot_check"]);
});

test("everything ticked skips nothing", () => {
  assert.deepEqual(skippedKeys(["a", "b"], ["a", "b"], [], true), []);
});

test("a stray kept key that was never offered changes nothing", () => {
  assert.deepEqual(skippedKeys(["a"], ["a", "zzz"], [], true), []);
});

test("columns show when the company's checks are unknown", () => {
  assert.equal(showsColumn(undefined, "spot_check"), true);
  assert.equal(showsColumn(["supervision"], "spot_check"), false);
  assert.equal(showsColumn(["spot_check"], "spot_check"), true);
});

test("ad hoc checks bring no columns", () => {
  assert.deepEqual(columnsForCheck("people", "mentoring"), []);
  assert.deepEqual(columnsForCheck("people", "spot_check"), ["Spot Check Due", "Recent Spot Check"]);
});
