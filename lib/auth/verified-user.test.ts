import { test } from "node:test";
import assert from "node:assert/strict";
import { trustedUserId } from "./verified-user.ts";

const A = "0d6e5b3e-1111-4c5a-9a0b-2c3d4e5f6a7b";
const B = "9f8e7d6c-2222-4b3a-8c9d-0e1f2a3b4c5d";

test("trusted only when middleware's verified id and the session are the same person", () => {
  assert.equal(trustedUserId(A, A), A);
  assert.equal(trustedUserId(A, B), null);
});

test("missing or malformed header means ask Auth again", () => {
  assert.equal(trustedUserId(null, A), null);
  assert.equal(trustedUserId("", A), null);
  assert.equal(trustedUserId("not-a-uuid", "not-a-uuid"), null);
  assert.equal(trustedUserId(A, null), null);
});
