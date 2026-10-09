import { test } from "node:test";
import assert from "node:assert/strict";
import { datedFileName, initialsOf, isFolderKey, parentKey, recordFileName, recordFolderName, safeDriveName } from "./names.ts";

test("drive names lose the characters OneDrive refuses", () => {
  assert.equal(safeDriveName('A/B\\C:D*E?F"G<H>I|J'), "A B C D E F G H I J");
  assert.equal(safeDriveName("  ..~$Name. . "), "Name");
  assert.equal(safeDriveName(""), "Untitled");
  assert.equal(safeDriveName("x".repeat(300)).length, 120);
});

test("record folders are Name (Branch)", () => {
  assert.equal(recordFolderName("Jane Smith", "Cardiff"), "Jane Smith (Cardiff)");
  assert.equal(recordFolderName("Jane Smith", null), "Jane Smith");
  assert.equal(recordFolderName("", "Cardiff"), "Unnamed (Cardiff)");
});

test("files are dated first and keep their version and extension", () => {
  assert.equal(datedFileName("2026-10-08T10:00:00Z", "Supervision 1", { version: 3 }), "2026-10-08 Supervision 1 (v3).pdf");
  assert.equal(datedFileName("2026-09-14", "Moving and handling", { ext: "JPG" }), "2026-09-14 Moving and handling.jpg");
  assert.equal(datedFileName("", "Policy"), "Policy.pdf");
});

test("folder keys and their parents", () => {
  assert.equal(parentKey("root"), null);
  assert.equal(parentKey("section:people"), "root");
  assert.equal(parentKey("person:0f8fad5b-d9cb-469f-a165-70867728950e"), "section:people");
  assert.equal(parentKey("service_user:0f8fad5b-d9cb-469f-a165-70867728950e"), "section:service_users");
  assert.ok(isFolderKey("section:briefings"));
  assert.ok(!isFolderKey("section:boards"));
  assert.ok(!isFolderKey("person:abc"));
});

test("initials come from each part of the name", () => {
  assert.equal(initialsOf("Gwyneth Ashby"), "GA");
  assert.equal(initialsOf("Mary-Jane O'Brien"), "MJO");
  assert.equal(initialsOf("  siân  ap   rhys "), "SAR");
  assert.equal(initialsOf(""), "XX");
});

test("record files are initials, SSID, what it is, date, and (2) on a clash", () => {
  assert.equal(recordFileName({ initials: "GA", ssid: "12345", title: "Spot Check", dateIso: "2026-10-09T10:00:00Z" }), "GA 12345 Spot Check 2026-10-09.pdf");
  assert.equal(recordFileName({ initials: "JS", title: "Spot Check", dateIso: "2026-10-09" }), "JS Spot Check 2026-10-09.pdf");
  assert.equal(recordFileName({ initials: "JS", ssid: "", title: "Spot Check", dateIso: "2026-10-09", n: 2 }), "JS Spot Check 2026-10-09 (2).pdf");
  assert.equal(recordFileName({ initials: "GA", ssid: "S/1", title: "Care plan", dateIso: "2026-10-09", ext: "DOCX" }), "GA S 1 Care plan 2026-10-09.docx");
  assert.equal(recordFileName({ initials: "JS", title: "First Aid certificate", dateIso: null, n: 1 }), "JS First Aid certificate.pdf");
});

test("two records with the same name in a branch get their own folders", () => {
  assert.equal(recordFolderName("John Smith", "Cardiff", 1), "John Smith (Cardiff)");
  assert.equal(recordFolderName("John Smith", "Cardiff", 2), "John Smith 2 (Cardiff)");
  assert.equal(recordFolderName("John Smith", null, 3), "John Smith 3");
});

test("a long title gives way so the date and the (2) survive", () => {
  const long = "A very long form name ".repeat(10) + "attachment from the phone camera";
  const a = recordFileName({ initials: "JS", ssid: "123456", title: long, dateIso: "2026-10-09", n: 2 });
  assert.ok(a.endsWith(" 2026-10-09 (2).pdf"), a);
  assert.ok(a.startsWith("JS 123456 A very long"), a);
  assert.ok(a.length <= 124, String(a.length));
  const b = datedFileName("2026-10-09", long, { version: 3, n: 2 });
  assert.ok(b.startsWith("2026-10-09 A very long") && b.endsWith(" (v3) (2).pdf"), b);
});
