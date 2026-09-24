import { test } from "node:test";
import assert from "node:assert/strict";
import { readmeText, safeFileName, sarSections, uniquePath, zipFileName } from "./layout.ts";

test("file names are made safe and keep their extension", () => {
  assert.equal(safeFileName("Care plan (v2).PDF"), "Care_plan_v2.PDF");
  assert.equal(safeFileName("../../etc/passwd"), "etcpasswd");
  assert.equal(safeFileName("   "), "file");
  assert.equal(safeFileName("Siân's form.docx"), "Sians_form.docx");
});

test("two files with one name never overwrite each other", () => {
  const used = new Set<string>();
  assert.equal(uniquePath(used, "files/updates", "photo.jpg"), "files/updates/photo.jpg");
  assert.equal(uniquePath(used, "files/updates", "photo.jpg"), "files/updates/photo_2.jpg");
  assert.equal(uniquePath(used, "files/updates", "PHOTO.jpg"), "files/updates/PHOTO_3.jpg");
  assert.equal(uniquePath(used, "files/evidence", "photo.jpg"), "files/evidence/photo.jpg");
});

test("the ZIP is named for the person and the day", () => {
  assert.equal(zipFileName("Jane O'Neil Smith", "2026-09-24"), "subject-access-jane-o-neil-smith-2026-09-24.zip");
  assert.equal(zipFileName("", "2026-09-24"), "subject-access-record-2026-09-24.zip");
});

test("each kind carries the sections Phil chose, and not the ones he left out", () => {
  const p = sarSections("person");
  for (const s of ["Record", "Checks", "Updates", "Training", "Holiday", "Absence", "Leaving", "Evidence"]) assert.ok(p.includes(s), s);
  const su = sarSections("service_user");
  for (const s of ["Record", "Checks", "Updates", "Care schedule", "Outcomes", "Evidence"]) assert.ok(su.includes(s), s);
  for (const s of [...p, ...su]) assert.ok(!/Complaint|Incident|Invoice|Access/.test(s), s);
});

test("the README names the controller's duty and every file, with no dashes", () => {
  const t = readmeText({
    kind: "service_user",
    recordName: "Amanda Ford",
    companyName: "Thistle Care Ltd",
    generatedAt: "24 September 2026, 12:30",
    generatedBy: "Bev Admin",
    files: ["summary.pdf", "files/updates/photo.jpg"],
  });
  assert.match(t, /Thistle Care Ltd is the controller/);
  assert.match(t, /FILES \(2\)/);
  assert.match(t, /files\/updates\/photo\.jpg/);
  assert.doesNotMatch(t, /[–—]/);
  assert.doesNotMatch(t, / - /);
});
