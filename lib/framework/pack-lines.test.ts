import test from "node:test";
import assert from "node:assert/strict";
import { packThemeHeading, packThemePairs, type PackThemeInput } from "./pack-lines.ts";

const LM: PackThemeInput = {
  title: "Leadership and Management",
  statusText: "Attention",
  reason: "75% on time, last 6 months",
  checks: { total: 31, overdue: 0, dueSoon: 1, onTrack: 30, unscheduled: 0 },
  waitingLine: "8 checks are waiting on an earlier check, so they are not counted here: 5 appraisals waiting for Supervision 3.",
  metrics: [
    { label: "Mandatory training", pct: 91.2 },
    { label: "Complaints answered on time, last six months", pct: null, note: null },
  ],
  notices: { priority: 0, improvement: 0 },
};

test("list 15: no score and no percentage readiness figure for the theme itself", () => {
  const pairs = packThemePairs(LM);
  assert.ok(!pairs.some((p) => p.label === "Score"));
  assert.equal(pairs[1].label, "Summary");
  assert.equal(pairs[1].value, "75% on time, last 6 months");
});

test("your own rating comes first, or says it is not rated (S8)", () => {
  assert.deepEqual(packThemePairs(LM)[0], { label: "Your rating", value: "Not rated yet" });
  assert.deepEqual(packThemePairs({ ...LM, ownRating: "Good, set by Bev Admin, 2 October 2026" })[0], {
    label: "Your rating",
    value: "Good, set by Bev Admin, 2 October 2026",
  });
});

test("the heading carries the status with no dash", () => {
  const h = packThemeHeading(LM);
  assert.equal(h, "Leadership and Management: Attention");
  assert.ok(!/[–—]/.test(h));
});

test("it says what the page says: counts, waiting, signals", () => {
  const byLabel = Object.fromEntries(packThemePairs(LM).map((p) => [p.label, p.value]));
  assert.equal(byLabel["Checks"], "0 overdue, 1 due soon, 30 on track");
  assert.match(byLabel["Waiting"], /waiting on an earlier check/);
  assert.equal(byLabel["Mandatory training"], "91.2%");
  assert.equal(byLabel["Complaints answered on time, last six months"], "No data yet");
  assert.equal(byLabel["Not scheduled"], undefined);
  assert.equal(byLabel["Notices"], undefined);
});

test("open notices and unscheduled checks are named", () => {
  const byLabel = Object.fromEntries(
    packThemePairs({
      ...LM,
      checks: { ...LM.checks, unscheduled: 1 },
      notices: { priority: 1, improvement: 2 },
    }).map((p) => [p.label, p.value]),
  );
  assert.equal(byLabel["Not scheduled"], "1 check has no due date");
  assert.equal(byLabel["Notices"], "1 Priority Action Notice open, 2 Areas for Improvement open");
});

test("no dashes anywhere in what the pack prints", () => {
  for (const p of packThemePairs({ ...LM, notices: { priority: 2, improvement: 1 } })) {
    assert.ok(!/[–—]/.test(p.value), p.value);
  }
});
