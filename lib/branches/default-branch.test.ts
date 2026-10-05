import { test } from "node:test";
import assert from "node:assert/strict";
import { pickDefaultBranch } from "./default-branch.ts";

const office = { id: "o", name: "Thistle Care Ltd Office", kind: "team" };
const cardiff = { id: "c", name: "Cardiff", kind: "branch" };
const newport = { id: "n", name: "Newport", kind: "branch" };
const all = [cardiff, newport, office];

test("opens on the viewer's primary branch", () => {
  assert.equal(pickDefaultBranch(all, "n"), "n"); // Charlotte
  assert.equal(pickDefaultBranch(all, "c"), "c"); // Hayley
});

test("no primary branch opens on the first branch by name, never the office", () => {
  assert.equal(pickDefaultBranch(all, null), "c"); // Company Admin
  assert.equal(pickDefaultBranch([newport, office, cardiff], null), "c");
});

test("a primary branch the viewer cannot see falls back to the first by name", () => {
  assert.equal(pickDefaultBranch([newport], "c"), "n");
});

test("the office is never chosen as a primary default", () => {
  assert.equal(pickDefaultBranch(all, "o"), "c");
});

test("a branch named in the link wins when the viewer can see it", () => {
  assert.equal(pickDefaultBranch(all, "n", "c"), "c");
  assert.equal(pickDefaultBranch(all, "n", "zzz"), "n");
});

test("a list without kinds (Service Users) still works", () => {
  assert.equal(pickDefaultBranch([{ id: "n", name: "Newport" }, { id: "c", name: "Cardiff" }], "n"), "n");
  assert.equal(pickDefaultBranch([{ id: "n", name: "Newport" }, { id: "c", name: "Cardiff" }], null), "c");
});

test("nothing to choose gives an empty string", () => {
  assert.equal(pickDefaultBranch([], "n"), "");
  assert.equal(pickDefaultBranch([office], null), "");
});

test("All branches is remembered only where the screen offers it", () => {
  assert.equal(pickDefaultBranch(all, "n", "all", { allowAll: true }), "");
  assert.equal(pickDefaultBranch(all, "n", "all"), "n"); // Service Users has no All branches
});
