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

import { cleanScwDate, scwRenewalState, scwApplyBy, scwCountsAsRegistered } from "./scw.ts";

test("cleanScwDate accepts a real date or blank and refuses nonsense", () => {
  assert.deepEqual(cleanScwDate("2028-03-12"), { ok: true, value: "2028-03-12" });
  assert.deepEqual(cleanScwDate(""), { ok: true, value: null });
  assert.equal(cleanScwDate("2028-02-30").ok, false);
  assert.equal(cleanScwDate("12/03/2028").ok, false);
  assert.equal(cleanScwDate("1999-01-01").ok, false);
});

test("scwRenewalState: red once passed, amber within 90 days, green after", () => {
  assert.equal(scwRenewalState(null, "2026-10-01"), null);
  assert.equal(scwRenewalState("2026-09-30", "2026-10-01"), "expired");
  assert.equal(scwRenewalState("2026-10-01", "2026-10-01"), "due_soon");
  assert.equal(scwRenewalState("2026-12-30", "2026-10-01"), "due_soon");
  assert.equal(scwRenewalState("2026-12-31", "2026-10-01"), "in_date");
});

test("scwApplyBy is 21 days before the renewal, across a month end", () => {
  assert.equal(scwApplyBy("2027-03-10"), "2027-02-17");
  assert.equal(scwApplyBy("2028-03-21"), "2028-02-29");
});

test("scwCountsAsRegistered: a number that has not ended", () => {
  assert.equal(scwCountsAsRegistered("W/1", null, "2026-10-01"), true);
  assert.equal(scwCountsAsRegistered("W/1", "2026-10-01", "2026-10-01"), true);
  assert.equal(scwCountsAsRegistered("W/1", "2026-09-30", "2026-10-01"), false);
  assert.equal(scwCountsAsRegistered(null, "2027-01-01", "2026-10-01"), false);
});
