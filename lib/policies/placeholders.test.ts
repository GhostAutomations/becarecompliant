import { test } from "node:test";
import assert from "node:assert/strict";
import { fillPlaceholders, findPlaceholders } from "./placeholders.ts";

const text = "Phone [To be completed: the out of hours number].\n- Training: [To be completed: how refresher training is delivered]\nAgain [To be completed: the out of hours number].";

test("each thing to complete is listed once, in order", () => {
  assert.deepEqual(findPlaceholders(text), ["the out of hours number", "how refresher training is delivered"]);
  assert.deepEqual(findPlaceholders("No gaps here."), []);
  assert.deepEqual(findPlaceholders("A [To be completed] gap"), ["Missing detail"]);
});

test("answers replace every copy; a blank answer leaves the placeholder", () => {
  const out = fillPlaceholders(text, { "the out of hours number": "01792 000000", "how refresher training is delivered": " " });
  assert.equal((out.match(/01792 000000/g) ?? []).length, 2);
  assert.match(out, /\[To be completed: how refresher training is delivered\]/);
});
