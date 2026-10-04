import { test } from "node:test";
import assert from "node:assert/strict";
import { attachmentProblem, storedContentType, EVIDENCE_FILE_MAX_BYTES } from "./attachment-rules.ts";

const f = (fileName: string, contentType: string, size = 1000, kind?: string) => ({ fileName, contentType, size, kind });

test("pictures, PDFs and Office files are taken", () => {
  for (const x of [f("a.pdf", "application/pdf"), f("p.JPG", "image/jpeg"), f("p.heic", "image/heic"), f("p.png", ""), f("d.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), f("s.xlsx", "application/octet-stream"), f("n.csv", "text/csv")]) {
    assert.equal(attachmentProblem(x), null, x.fileName);
  }
});
test("HTML, SVG, scripts and unknown types are refused", () => {
  for (const x of [f("a.html", "text/html"), f("i.svg", "image/svg+xml"), f("x.js", "text/javascript"), f("noext", "application/pdf"), f("a.exe", "application/octet-stream")]) {
    assert.notEqual(attachmentProblem(x), null, x.fileName);
  }
});
test("a name that disagrees with its type is refused", () => {
  assert.notEqual(attachmentProblem(f("photo.jpg", "text/html")), null);
  assert.notEqual(attachmentProblem(f("form.pdf", "image/svg+xml")), null);
});
test("empty and oversized files are refused", () => {
  assert.notEqual(attachmentProblem(f("a.pdf", "application/pdf", 0)), null);
  assert.notEqual(attachmentProblem(f("a.pdf", "application/pdf", EVIDENCE_FILE_MAX_BYTES + 1)), null);
  assert.equal(attachmentProblem(f("a.pdf", "application/pdf", EVIDENCE_FILE_MAX_BYTES)), null);
});
test("signatures must be PNG", () => {
  assert.equal(attachmentProblem(f("signature.png", "image/png", 500, "signature")), null);
  assert.notEqual(attachmentProblem(f("signature.png", "text/html", 500, "signature")), null);
});
test("stored type follows the name when the browser sent none", () => {
  assert.equal(storedContentType(f("p.png", "")), "image/png");
  assert.equal(storedContentType(f("s.xlsx", "application/octet-stream")), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(storedContentType(f("a.pdf", "application/pdf")), "application/pdf");
});
