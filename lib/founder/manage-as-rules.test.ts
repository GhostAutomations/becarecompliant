import test from "node:test";
import assert from "node:assert/strict";
import { actingCompanyGone } from "./manage-as-rules.ts";

test("a deleted company ends manage as (DEF-013)", () => {
  assert.equal(actingCompanyGone("deleted"), true);
});

test("an active or suspended company can still be managed", () => {
  assert.equal(actingCompanyGone("active"), false);
  assert.equal(actingCompanyGone("suspended"), false);
  assert.equal(actingCompanyGone(null), false);
});
