import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLoginName, LOGIN_NAME_MAX } from "./login-name.ts";

test("spaces at the ends go and runs of spaces become one", () => {
  assert.deepEqual(cleanLoginName("  Jo   Bloggs "), { ok: true, value: "Jo Bloggs" });
  assert.deepEqual(cleanLoginName("Mary-Anne O'Brien"), { ok: true, value: "Mary-Anne O'Brien" });
});

test("an empty name is refused in plain words", () => {
  assert.deepEqual(cleanLoginName("   "), { ok: false, error: "Enter a name." });
  assert.deepEqual(cleanLoginName(null), { ok: false, error: "Enter a name." });
});

test("a name over the limit is refused, one at the limit is kept", () => {
  assert.equal(cleanLoginName("a".repeat(LOGIN_NAME_MAX)).ok, true);
  const long = cleanLoginName("a".repeat(LOGIN_NAME_MAX + 1));
  assert.equal(long.ok, false);
});
