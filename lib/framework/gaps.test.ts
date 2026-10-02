import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafetyCheck, actionInPlace, gapRisk, metricGap, ciwAnchor } from "./gaps.ts";

test("safety checks by key and by name", () => {
  assert.equal(isSafetyCheck("competency", "Medication Competency"), true);
  assert.equal(isSafetyCheck("supervision", "Supervision"), false);
  assert.equal(isSafetyCheck("custom_1", "MAR Audit"), true);
  assert.equal(isSafetyCheck("custom_2", "Risk Assessment Review"), true);
  assert.equal(isSafetyCheck(null, "DBS renewal"), true);
  assert.equal(isSafetyCheck("spot_check", "Spot Check"), false);
  assert.equal(isSafetyCheck("care_plan_review", "Care Plan Review"), false);
  // "Smart" must not match "mar".
  assert.equal(isSafetyCheck("x", "Smart goals review"), false);
});

test("a booking still to happen is an action, a past one is not", () => {
  assert.deepEqual(actionInPlace({ dueDate: "2026-09-01", todayIso: "2026-10-02", bookings: ["2026-10-05", "2026-10-03"], updates: [] }), { kind: "booked", on: "2026-10-03" });
  assert.equal(actionInPlace({ dueDate: "2026-09-01", todayIso: "2026-10-02", bookings: ["2026-09-20"], updates: [] }), null);
  // Booked for today still counts.
  assert.deepEqual(actionInPlace({ dueDate: "2026-09-01", todayIso: "2026-10-02", bookings: ["2026-10-02"], updates: [] }), { kind: "booked", on: "2026-10-02" });
});

test("only an update on or after the due date counts, newest wins", () => {
  const updates = [
    { on: "2026-08-30", by: "A" },
    { on: "2026-09-01", by: "B" },
    { on: "2026-09-15", by: "C" },
  ];
  assert.deepEqual(actionInPlace({ dueDate: "2026-09-01", todayIso: "2026-10-02", bookings: [], updates }), { kind: "update", on: "2026-09-15", by: "C" });
  assert.equal(actionInPlace({ dueDate: "2026-09-01", todayIso: "2026-10-02", bookings: [], updates: [{ on: "2026-08-30", by: "A" }] }), null);
});

test("a booking beats an update", () => {
  const a = actionInPlace({ dueDate: "2026-09-01", todayIso: "2026-10-02", bookings: ["2026-10-10"], updates: [{ on: "2026-09-15", by: "C" }] });
  assert.equal(a?.kind, "booked");
});

test("CIW matrix: safety with nothing in place is PAN risk, everything else AFI likely", () => {
  assert.equal(gapRisk(true, null), "pan_risk");
  assert.equal(gapRisk(true, { kind: "booked", on: "2026-10-03" }), "afi_likely");
  assert.equal(gapRisk(false, null), "afi_likely");
  assert.equal(gapRisk(false, { kind: "update", on: "2026-10-01", by: "X" }), "afi_likely");
});

test("metric gaps sit below 85, safeguarding under 50 is a safety gap", () => {
  assert.equal(metricGap("Mandatory training", 85), null);
  assert.equal(metricGap("Mandatory training", null), null);
  assert.equal(metricGap("Mandatory training", 84)?.risk, "afi_likely");
  assert.equal(metricGap("Safeguarding training", 60)?.risk, "afi_likely");
  assert.equal(metricGap("Safeguarding training", 49)?.risk, "pan_risk");
  assert.equal(metricGap("Completed by the due date, last six months", 70)?.anchor, "CIW Good: one to one supervision at least quarterly, and an annual review.");
});

test("anchors name CIW's own Good descriptor", () => {
  assert.match(ciwAnchor("Social Care Wales registration") ?? "", /professional bodies/);
  assert.equal(ciwAnchor("Something else"), null);
});

test("the on time anchor follows the theme", () => {
  assert.match(metricGap("Completed by the due date, last six months", 70, "LM")?.anchor ?? "", /supervision at least quarterly/);
  assert.match(metricGap("Completed by the due date, last six months", 70, "CS")?.anchor ?? "", /personal plans reviewed/);
});
