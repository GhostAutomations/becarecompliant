import test from "node:test";
import assert from "node:assert/strict";
import { creditsAdded } from "./credits-added.ts";

test("labels each addition the way Phil asked", () => {
  const out = creditsAdded(
    [
      { delta: 200, reason: "goodwill", created_at: "2026-10-14T09:00:00Z" },
      { delta: 2000, reason: "monthly_grant", created_at: "2026-10-01T05:00:00Z" },
    ],
    [{ delta: 100, reason: "topup", created_at: "2026-10-05T12:00:00Z" }],
  );
  assert.deepEqual(out.map((r) => [r.text, r.date]), [
    ["+200 SMS credits, goodwill from Be Care Compliant", "14 Oct 2026"],
    ["+100 AI credits, top up", "5 Oct 2026"],
    ["+2,000 SMS credits, monthly allowance", "1 Oct 2026"],
  ]);
});

test("spends, refunds and adjustments are not additions", () => {
  const out = creditsAdded(
    [
      { delta: -1, reason: "spend", created_at: "2026-10-14T09:00:00Z" },
      { delta: 5, reason: "adjustment", created_at: "2026-10-14T09:00:00Z" },
    ],
    [{ delta: 1, reason: "refund", created_at: "2026-10-14T09:00:00Z" }],
  );
  assert.deepEqual(out, []);
});

test("newest first, at most 12, and the London day across midnight in summer time", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ delta: 1, reason: "goodwill", created_at: `2026-09-${String(i + 1).padStart(2, "0")}T10:00:00Z` }));
  const out = creditsAdded(many, []);
  assert.equal(out.length, 12);
  assert.equal(out[0].date, "20 Sep 2026");
  assert.equal(out[0].text, "+1 SMS credit, goodwill from Be Care Compliant");
  // 23:30 UTC on 31 August is 00:30 on 1 September in London.
  assert.equal(creditsAdded([{ delta: 3, reason: "goodwill", created_at: "2026-08-31T23:30:00Z" }], [])[0].date, "1 Sep 2026");
});
