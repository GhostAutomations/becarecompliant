import { test } from "node:test";
import assert from "node:assert/strict";
import { dbsWarnings, dbsRenewalFrom, followDbsRenewal, withDbsRenewal } from "./dbs-check.ts";

test("the three real Thistle rows are all flagged", () => {
  // Asim Riaz: six years.
  assert.equal(dbsWarnings({ certificateDate: "2026-02-16", renewalDate: "2032-02-16", startDate: "2026-02-16" }).length, 1);
  // Taiye: five years.
  assert.match(dbsWarnings({ certificateDate: "2025-11-21", renewalDate: "2030-11-21" })[0], /more than 3 years/);
  // Jamie Meredith: certificate after he started.
  assert.match(
    dbsWarnings({ certificateDate: "2026-07-27", renewalDate: "2029-07-27", startDate: "2026-01-06" })[0],
    /after they started \(06\/01\/2026\)/,
  );
});

test("the usual three years, or less, says nothing", () => {
  assert.deepEqual(dbsWarnings({ certificateDate: "2025-03-04", renewalDate: "2028-03-04", startDate: "2025-03-11" }), []);
  assert.deepEqual(dbsWarnings({ certificateDate: "2024-12-13", renewalDate: "2027-12-10" }), []);
  assert.deepEqual(dbsWarnings({ certificateDate: "2025-01-01", renewalDate: "2026-01-01" }), []);
});

test("a renewal on or before the certificate is flagged", () => {
  assert.match(dbsWarnings({ certificateDate: "2025-06-01", renewalDate: "2025-06-01" })[0], /not after/);
  assert.match(dbsWarnings({ certificateDate: "2025-06-01", renewalDate: "2024-06-01" })[0], /not after/);
});

test("leap day plus three years", () => {
  assert.deepEqual(dbsWarnings({ certificateDate: "2024-02-29", renewalDate: "2027-02-28" }), []);
  assert.equal(dbsWarnings({ certificateDate: "2024-02-29", renewalDate: "2027-03-01" }).length, 1);
});

test("missing dates say nothing", () => {
  assert.deepEqual(dbsWarnings({}), []);
  assert.deepEqual(dbsWarnings({ certificateDate: "2025-01-01" }), []);
  assert.deepEqual(dbsWarnings({ renewalDate: "2030-01-01", startDate: "2025-01-01" }), []);
});

test("Enhanced DBS is the date of issue plus three years, to the day", () => {
  assert.equal(dbsRenewalFrom("2024-05-12"), "2027-05-12");
  assert.equal(dbsRenewalFrom("2025-12-31"), "2028-12-31");
  // 29 February into a year with no 29th settles on the 28th.
  assert.equal(dbsRenewalFrom("2024-02-29"), "2027-02-28");
  assert.equal(dbsRenewalFrom(""), null);
  assert.equal(dbsRenewalFrom("12/05/2024"), null);
  assert.equal(dbsRenewalFrom(null), null);
});

test("the renewal box follows the issue date until somebody types their own", () => {
  // Blank: filled.
  assert.equal(followDbsRenewal("", "", "2024-05-12"), "2027-05-12");
  // Still ours: moves with the issue date.
  assert.equal(followDbsRenewal("2024-05-12", "2027-05-12", "2024-06-01"), "2027-06-01");
  // Typed by hand (Update Service): left alone.
  assert.equal(followDbsRenewal("2024-05-12", "2030-05-12", "2024-06-01"), "2030-05-12");
  // Issue date cleared: our date goes, a typed one stays.
  assert.equal(followDbsRenewal("2024-05-12", "2027-05-12", ""), "");
  assert.equal(followDbsRenewal("2024-05-12", "2030-05-12", ""), "2030-05-12");
});

test("a blank renewal is filled on save, a given one always wins", () => {
  assert.equal(withDbsRenewal("2024-05-12", null), "2027-05-12");
  assert.equal(withDbsRenewal("2024-05-12", ""), "2027-05-12");
  assert.equal(withDbsRenewal("2024-05-12", "2030-01-01"), "2030-01-01");
  assert.equal(withDbsRenewal(null, null), null);
});
