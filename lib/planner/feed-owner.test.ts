import { test } from "node:test";
import assert from "node:assert/strict";
import { feedOwnerIsLive } from "./feed-owner.ts";

const C = "co-1";
const live = { status: "active", deleted_at: null };

test("an active login in a live company is served", () => {
  assert.equal(feedOwnerIsLive({ status: "active", company_id: C }, live, C), true);
});
test("a disabled or invited login is not", () => {
  assert.equal(feedOwnerIsLive({ status: "disabled", company_id: C }, live, C), false);
  assert.equal(feedOwnerIsLive({ status: "invited", company_id: C }, live, C), false);
});
test("a login now in another company is not", () => {
  assert.equal(feedOwnerIsLive({ status: "active", company_id: "co-2" }, live, C), false);
});
test("a suspended, archived or deleted company is not", () => {
  const me = { status: "active", company_id: C };
  assert.equal(feedOwnerIsLive(me, { status: "suspended", deleted_at: null }, C), false);
  assert.equal(feedOwnerIsLive(me, { status: "archived", deleted_at: null }, C), false);
  assert.equal(feedOwnerIsLive(me, { status: "active", deleted_at: "2026-10-01T00:00:00Z" }, C), false);
});
test("a missing login or company is not", () => {
  assert.equal(feedOwnerIsLive(null, live, C), false);
  assert.equal(feedOwnerIsLive({ status: "active", company_id: C }, null, C), false);
});
