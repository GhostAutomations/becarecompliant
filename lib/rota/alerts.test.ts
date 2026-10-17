import { test } from "node:test";
import assert from "node:assert/strict";
import { DOSE_CLEAR_REASONS, VISIT_CLEAR_REASONS, arrivalWords, clearReasonLabel, todayStatus } from "./alerts.ts";

const min = 60_000;
const start = Date.parse("2026-10-18T11:30:00Z");
const end = start + 30 * min;
const base = { startsAtMs: start, endsAtMs: end, carers: ["a"], clocks: [] as { personId: string; kind: "in" | "out" }[] };

test("reasons: the codes the database accepts, A to Z with Other last", () => {
  assert.deepEqual(VISIT_CLEAR_REASONS.map((r) => r.code).sort(), ["arrived_late", "covered", "forgot_clock_in", "moved", "other", "su_cancelled", "su_hospital"]);
  assert.deepEqual(DOSE_CLEAR_REASONS.map((r) => r.code).sort(), ["dose_reason_told", "forgot_record", "medicine_changed", "other"]);
  for (const list of [VISIT_CLEAR_REASONS, DOSE_CLEAR_REASONS]) {
    assert.equal(list[list.length - 1].code, "other");
    const labels = list.slice(0, -1).map((r) => r.label);
    assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, "en-GB")));
  }
  assert.equal(clearReasonLabel("covered"), "Covered by another carer");
  assert.equal(clearReasonLabel("other", "Bus broke down"), "Bus broke down");
});

test("Today: not started, late at 15 minutes, missed 30 minutes after the end", () => {
  assert.equal(todayStatus({ ...base, nowMs: start + 14 * min }), "not_started");
  assert.equal(todayStatus({ ...base, nowMs: start + 15 * min }), "late");
  assert.equal(todayStatus({ ...base, nowMs: end + 29 * min }), "late");
  assert.equal(todayStatus({ ...base, nowMs: end + 30 * min }), "missed");
  // no carer at all is late too
  assert.equal(todayStatus({ ...base, carers: [], nowMs: start + 20 * min }), "late");
});

test("Today: in progress, overrunning 15 minutes past the end, done; a double up with one carer missing is late", () => {
  const inOnly = [{ personId: "a", kind: "in" as const }];
  assert.equal(todayStatus({ ...base, clocks: inOnly, nowMs: start + 5 * min }), "in_progress");
  assert.equal(todayStatus({ ...base, clocks: inOnly, nowMs: end + 14 * min }), "in_progress");
  assert.equal(todayStatus({ ...base, clocks: inOnly, nowMs: end + 15 * min }), "overrunning");
  assert.equal(todayStatus({ ...base, clocks: [...inOnly, { personId: "a", kind: "out" }], nowMs: end }), "done");
  assert.equal(todayStatus({ ...base, carers: ["a", "b"], clocks: inOnly, nowMs: start + 20 * min }), "late");
  assert.equal(todayStatus({ ...base, carers: ["a", "b"], clocks: inOnly, nowMs: start + 10 * min }), "in_progress");
});

test("arrival in words", () => {
  assert.equal(arrivalWords(start, start + 10 * min), "On time");
  assert.equal(arrivalWords(start, start + 22 * min), "22 min late");
  assert.equal(arrivalWords(start, start - 20 * min), "20 min early");
  assert.equal(arrivalWords(start, null), null);
});
