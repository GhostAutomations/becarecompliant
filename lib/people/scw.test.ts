import test from "node:test";
import assert from "node:assert/strict";
import { cleanScwNumber, scwStatus } from "./scw.ts";

test("cleanScwNumber tidies spaces, allows blank, refuses junk and long values", () => {
  assert.deepEqual(cleanScwNumber("  1234 567 "), { ok: true, value: "1234 567" });
  assert.deepEqual(cleanScwNumber(""), { ok: true, value: null });
  assert.deepEqual(cleanScwNumber(null), { ok: true, value: null });
  assert.equal(cleanScwNumber("12<script>").ok, false);
  assert.equal(cleanScwNumber("1".repeat(21)).ok, false);
});

test("scwStatus: a number is registered; no number is missing only after 6 months in post", () => {
  assert.equal(scwStatus("123456", "2026-09-01", "2026-10-01"), "registered");
  assert.equal(scwStatus(null, "2026-04-01", "2026-10-01"), "missing");
  assert.equal(scwStatus(null, "2026-04-02", "2026-10-01"), "not_yet");
  assert.equal(scwStatus("  ", "2020-01-01", "2026-10-01"), "missing");
  assert.equal(scwStatus(null, null, "2026-10-01"), "missing");
});

test("scwStatus clamps the six months back to the end of a short month", () => {
  assert.equal(scwStatus(null, "2026-04-30", "2026-10-31"), "missing");
  assert.equal(scwStatus(null, "2026-05-01", "2026-10-31"), "not_yet");
});
