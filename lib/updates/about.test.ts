import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAbout, aboutValue } from "./about.ts";

const ID = "6fbc301f-dc6c-46df-8d24-78f5addde8ff";

test("parses the three shapes and nothing", () => {
  assert.equal(parseAbout(""), null);
  assert.equal(parseAbout(undefined), null);
  assert.deepEqual(parseAbout("dbs_renewal"), { instance: null, tracker: "dbs_renewal" });
  assert.deepEqual(parseAbout("right_to_work"), { instance: null, tracker: "right_to_work" });
  assert.deepEqual(parseAbout(`check:${ID}`), { instance: ID, tracker: null });
});

test("refuses anything else", () => {
  assert.equal(parseAbout("check:nope"), undefined);
  assert.equal(parseAbout("passport"), undefined);
  assert.equal(parseAbout(ID), undefined);
});

test("round trips", () => {
  assert.equal(aboutValue({ instance: ID }), `check:${ID}`);
  assert.equal(aboutValue({ tracker: "right_to_work" }), "right_to_work");
  assert.equal(aboutValue({}), "");
  assert.deepEqual(parseAbout(aboutValue({ instance: ID })), { instance: ID, tracker: null });
});
