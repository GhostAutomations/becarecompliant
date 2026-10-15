import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByRecord, personRollupRag, rollupCounts, serviceUserRollupRag } from "./rollup.ts";

const rows = (...rags: Array<string | null>) => rags.map((rag) => ({ rag }));

test("no checks is none for both registers", () => {
  const c = rollupCounts([]);
  assert.deepEqual(c, { total_checks: 0, red_count: 0, amber_count: 0, green_count: 0, paused_count: 0 });
  assert.equal(personRollupRag(c), "none");
  assert.equal(serviceUserRollupRag(c), "none");
});

test("red beats amber beats green, as the views do", () => {
  assert.equal(personRollupRag(rollupCounts(rows("green", "amber", "red"))), "red");
  assert.equal(personRollupRag(rollupCounts(rows("green", "amber"))), "amber");
  assert.equal(personRollupRag(rollupCounts(rows("green", "green"))), "green");
});

test("a check with no colour counts in the total and leaves the Record green", () => {
  const c = rollupCounts(rows(null, "grey"));
  assert.equal(c.total_checks, 2);
  assert.equal(c.green_count, 0);
  assert.equal(personRollupRag(c), "green");
  assert.equal(serviceUserRollupRag(c), "green");
});

test("paused sits after amber and before green for a Service User", () => {
  assert.equal(serviceUserRollupRag(rollupCounts(rows("green", "paused"))), "paused");
  assert.equal(serviceUserRollupRag(rollupCounts(rows("amber", "paused"))), "amber");
  assert.equal(serviceUserRollupRag(rollupCounts(rows("red", "paused"))), "red");
  assert.equal(rollupCounts(rows("paused", "paused", "green")).paused_count, 2);
});

test("paused sits after amber and before green for a Person on leave (0484)", () => {
  assert.equal(personRollupRag(rollupCounts(rows("green", "paused"))), "paused");
  assert.equal(personRollupRag(rollupCounts(rows("paused", "none"))), "paused");
  assert.equal(personRollupRag(rollupCounts(rows("amber", "paused"))), "amber");
  assert.equal(personRollupRag(rollupCounts(rows("red", "paused"))), "red");
});

test("groupByRecord keeps every row under its Record", () => {
  const g = groupByRecord([{ id: "a", rag: "red" }, { id: "b", rag: "green" }, { id: "a", rag: "amber" }], (r) => r.id);
  assert.equal(g.get("a")?.length, 2);
  assert.equal(g.get("b")?.length, 1);
  assert.equal(g.get("c"), undefined);
});
