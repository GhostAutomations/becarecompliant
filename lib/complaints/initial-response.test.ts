import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_NO_INITIAL_RESPONSE, needsInitialResponse } from "./types.ts";

test("minor complaints and concerns need no initial response by default (Phil, 2026-10-05)", () => {
  assert.equal(needsInitialResponse("Minor Complaint", DEFAULT_NO_INITIAL_RESPONSE), false);
  assert.equal(needsInitialResponse("Concern", DEFAULT_NO_INITIAL_RESPONSE), false);
  assert.equal(needsInitialResponse("Complaint", DEFAULT_NO_INITIAL_RESPONSE), true);
  assert.equal(needsInitialResponse("Audit Identification", DEFAULT_NO_INITIAL_RESPONSE), true);
});

test("a complaint with no category always needs one, and the company setting decides the rest", () => {
  assert.equal(needsInitialResponse(null, DEFAULT_NO_INITIAL_RESPONSE), true);
  assert.equal(needsInitialResponse("", DEFAULT_NO_INITIAL_RESPONSE), true);
  assert.equal(needsInitialResponse("Concern", []), true);
  assert.equal(needsInitialResponse("Complaint", ["Complaint"]), false);
});
