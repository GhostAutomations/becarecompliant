import { test } from "node:test";
import assert from "node:assert/strict";
import { avatarInitials } from "./avatar-initials.ts";

test("first name and surname give two letters", () => {
  assert.equal(avatarInitials("Jo Bloggs"), "JB");
  assert.equal(avatarInitials("ZZ Test Supervisor"), "ZS");
  assert.equal(avatarInitials("  mary   ann  jones "), "MJ");
});

test("hyphens and apostrophes stay part of their name", () => {
  assert.equal(avatarInitials("Mary-Anne O'Brien"), "MO");
  assert.equal(avatarInitials("Siân ap Rhys"), "SR");
});

test("one name gives one letter", () => {
  assert.equal(avatarInitials("Cher"), "C");
});

test("no name falls back to the email, then a question mark", () => {
  assert.equal(avatarInitials(null, "office@example.com"), "O");
  assert.equal(avatarInitials("", "  "), "?");
  assert.equal(avatarInitials(undefined), "?");
});
