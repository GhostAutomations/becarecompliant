import { test } from "node:test";
import assert from "node:assert/strict";
import { datedFileName, isFolderKey, parentKey, recordFolderName, safeDriveName } from "./names.ts";

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
