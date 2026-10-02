import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesVisibleWhen } from "./form-visibility.ts";

test("DEF-104: a yes_no answer shows its follow up whatever the case the form was written in", () => {
  assert.equal(matchesVisibleWhen(["no"], "No"), true);
  assert.equal(matchesVisibleWhen(["No"], "No"), true);
  assert.equal(matchesVisibleWhen(["yes"], "No"), false);
  assert.equal(matchesVisibleWhen(["no"], undefined), false);
  assert.equal(matchesVisibleWhen(["fall"], ["Fall", "Other"]), true);
  assert.equal(matchesVisibleWhen(["accident"], "near_miss"), false);
});
