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

import { scwRenewalFromIssue, resolveScwDates } from "./scw.ts";

test("scwRenewalFromIssue is three years on, 29 February to 28 February", () => {
  assert.equal(scwRenewalFromIssue("2025-03-12"), "2028-03-12");
  assert.equal(scwRenewalFromIssue("2024-02-29"), "2027-02-28");
  assert.equal(scwRenewalFromIssue(null), null);
});

test("resolveScwDates: typed renewal wins, else worked out; guards", () => {
  assert.deepEqual(resolveScwDates({ number: "W/1", issue: "2025-03-12", renewal: null }), { ok: true, issue: "2025-03-12", renewal: "2028-03-12" });
  assert.deepEqual(resolveScwDates({ number: "W/1", issue: "2025-03-12", renewal: "2028-04-01" }), { ok: true, issue: "2025-03-12", renewal: "2028-04-01" });
  assert.deepEqual(resolveScwDates({ number: "W/1", issue: null, renewal: "2028-04-01" }), { ok: true, issue: null, renewal: "2028-04-01" });
  assert.equal(resolveScwDates({ number: null, issue: "2025-03-12", renewal: null }).ok, false);
  assert.equal(resolveScwDates({ number: "W/1", issue: "2025-03-12", renewal: "2025-03-01" }).ok, false);
  assert.deepEqual(resolveScwDates({ number: null, issue: null, renewal: null }), { ok: true, issue: null, renewal: null });
});
