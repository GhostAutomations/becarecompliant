import { test } from "node:test";
import assert from "node:assert/strict";
import { OWN_RECORD_CHECK_REFUSAL, isOwnRecord } from "./own-record.ts";

test("a record linked to the signed in login is their own", () => {
  assert.equal(isOwnRecord("u1", "u1"), true);
});

test("somebody else's record, or a record with no login, is not", () => {
  assert.equal(isOwnRecord("u2", "u1"), false);
  assert.equal(isOwnRecord(null, "u1"), false);
  assert.equal(isOwnRecord(undefined, "u1"), false);
  assert.equal(isOwnRecord("", ""), false);
  assert.equal(isOwnRecord(null, null), false);
});

test("the refusal reads as the database's (0444) and has no dashes as punctuation", () => {
  assert.equal(OWN_RECORD_CHECK_REFUSAL, "This is your own record, so someone else must complete this check.");
  assert.ok(!/ [-–—] /.test(OWN_RECORD_CHECK_REFUSAL));
});
