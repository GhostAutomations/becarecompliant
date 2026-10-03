import { test } from "node:test";
import assert from "node:assert/strict";
import { dbsMissing, rtwMissing, hasStarted, missingDocuments, type DocTracker } from "./doc-gaps.ts";

const empty: DocTracker = { dbs_date: null, enhanced_dbs_date: null, rtw_expiry_date: null, rtw_limits: null };

test("no tracker row at all is both documents missing", () => {
  assert.equal(dbsMissing(null), true);
  assert.equal(rtwMissing(undefined), true);
});

test("either DBS date on file means DBS is recorded", () => {
  assert.equal(dbsMissing({ ...empty, dbs_date: "2025-01-01" }), false);
  assert.equal(dbsMissing({ ...empty, enhanced_dbs_date: "2028-01-01" }), false);
  assert.equal(dbsMissing({ ...empty, dbs_date: "  " }), true);
});

test("Right to Work: limits of 'none' with no expiry is recorded (a British citizen)", () => {
  assert.equal(rtwMissing({ ...empty, rtw_limits: "none" }), false);
  assert.equal(rtwMissing({ ...empty, rtw_expiry_date: "2027-05-01" }), false);
  assert.equal(rtwMissing(empty), true);
});

test("a gap starts on the start date, not before", () => {
  assert.equal(hasStarted("2026-10-03", "2026-10-03"), true);
  assert.equal(hasStarted("2026-10-04", "2026-10-03"), false);
  assert.equal(hasStarted(null, "2026-10-03"), true);
  assert.deepEqual(missingDocuments(empty, "2026-10-04", "2026-10-03"), []);
});

test("both missing after the start date: two gaps dated from the start date", () => {
  const gaps = missingDocuments(empty, "2026-10-01", "2026-10-03");
  assert.deepEqual(gaps, [
    { kind: "dbs_renewal", name: "DBS not recorded", since: "2026-10-01" },
    { kind: "right_to_work", name: "Right to Work not recorded", since: "2026-10-01" },
  ]);
});

test("both on file: no gaps; one on file: only the other", () => {
  assert.deepEqual(missingDocuments({ dbs_date: "2025-01-01", enhanced_dbs_date: "2028-01-01", rtw_limits: "none", rtw_expiry_date: null }, "2025-01-01", "2026-10-03"), []);
  const g = missingDocuments({ ...empty, rtw_limits: "visa_expires", rtw_expiry_date: "2027-01-01" }, "2025-01-01", "2026-10-03");
  assert.equal(g.length, 1);
  assert.equal(g[0].kind, "dbs_renewal");
});

test("no start date counts from today", () => {
  assert.equal(missingDocuments(empty, null, "2026-10-03")[0].since, "2026-10-03");
});
