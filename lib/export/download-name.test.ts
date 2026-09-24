import test from "node:test";
import assert from "node:assert/strict";
import { fileNameFromDisposition } from "./download-name.ts";

test("reads the name the server gave the pack", () => {
  assert.equal(
    fileNameFromDisposition('attachment; filename="inspection-readiness-pack-2026-09-24.pdf"', "x.pdf"),
    "inspection-readiness-pack-2026-09-24.pdf",
  );
});

test("falls back when there is no header", () => {
  assert.equal(fileNameFromDisposition(null, "inspection-pack.pdf"), "inspection-pack.pdf");
});

test("reads the encoded form too", () => {
  assert.equal(fileNameFromDisposition("attachment; filename*=UTF-8''pack%20one.pdf", "x.pdf"), "pack one.pdf");
});
