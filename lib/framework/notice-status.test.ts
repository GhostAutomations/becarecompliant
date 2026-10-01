import test from "node:test";
import assert from "node:assert/strict";
import { NOTICE_STATUSES, isNoticeStatus, noticeStatusLabel, resolvedOnFor } from "./notice-status.ts";

test("the four CIW statuses, in the report's order", () => {
  assert.deepEqual(NOTICE_STATUSES.map((s) => s.label), ["New", "Reviewed", "Not achieved", "Achieved"]);
});
test("only achieved closes a notice, and keeps an existing date", () => {
  assert.equal(resolvedOnFor("achieved", null, "2026-10-01"), "2026-10-01");
  assert.equal(resolvedOnFor("achieved", "2025-01-14", "2026-10-01"), "2025-01-14");
  for (const s of ["new", "reviewed", "not_achieved"] as const) assert.equal(resolvedOnFor(s, "2025-01-14", "2026-10-01"), null);
});
test("unknown values are refused and label falls back to New", () => {
  assert.equal(isNoticeStatus("done"), false);
  assert.equal(isNoticeStatus("reviewed"), true);
  assert.equal(noticeStatusLabel(null), "New");
});
test("no dashes in the words shown", () => {
  for (const s of NOTICE_STATUSES) {
    assert.doesNotMatch(s.label, /[—–-]/);
    assert.doesNotMatch(s.meaning, /[—–]/);
  }
});
