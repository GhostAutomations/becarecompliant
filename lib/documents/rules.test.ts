import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. */
import {
  DOC_MAX_BYTES,
  DOC_MAX_FILES,
  docCountLabel,
  docFilePath,
  docFileProblem,
  docFilesProblem,
  docMimeType,
  docSizeLabel,
  docTitleFromFileName,
  docTitleProblem,
} from "./rules.ts";

test("a saved email, a photo, a PDF and Word are all accepted", () => {
  for (const name of ["Email from council.eml", "Outlook message.msg", "photo.HEIC", "cert.pdf", "letter.docx", "rota.xlsx"]) {
    assert.equal(docFileProblem({ name, size: 1000 }), null, name);
  }
});

test("other kinds of file are refused with what IS allowed", () => {
  const p = docFileProblem({ name: "setup.exe", size: 1000 });
  assert.ok(p && /cannot be uploaded/.test(p) && /PDF/.test(p));
  assert.ok(docFileProblem({ name: "no extension", size: 1000 }));
});

test("empty and oversized files are refused", () => {
  assert.match(docFileProblem({ name: "a.pdf", size: 0 }) ?? "", /empty/);
  assert.match(docFileProblem({ name: "a.pdf", size: DOC_MAX_BYTES + 1 }) ?? "", /over 20 MB/);
  assert.equal(docFileProblem({ name: "a.pdf", size: DOC_MAX_BYTES }), null);
});

test("a set needs at least one file and no more than the limit", () => {
  assert.match(docFilesProblem([]) ?? "", /Choose a file/);
  const many = Array.from({ length: DOC_MAX_FILES + 1 }, (_, i) => ({ name: `${i}.pdf`, size: 10 }));
  assert.match(docFilesProblem(many) ?? "", /up to 10/);
  assert.equal(docFilesProblem(many.slice(0, DOC_MAX_FILES)), null);
});

test("the type is read from the extension, whatever its case", () => {
  assert.equal(docMimeType("x.PDF"), "application/pdf");
  assert.equal(docMimeType("x.eml"), "message/rfc822");
  assert.equal(docMimeType("x.unknown"), "application/octet-stream");
});

test("a document's starting name is its file name, tidied", () => {
  assert.equal(docTitleFromFileName("Email_from_council.pdf"), "Email from council");
  assert.equal(docTitleFromFileName("  DBS   certificate.jpeg "), "DBS certificate");
  assert.equal(docTitleFromFileName(".pdf"), "Document");
  assert.equal(docTitleFromFileName("x".repeat(200) + ".pdf").length, 120);
});

test("a name is required and kept short", () => {
  assert.match(docTitleProblem("   ") ?? "", /short name/);
  assert.match(docTitleProblem("x".repeat(121)) ?? "", /120/);
  assert.equal(docTitleProblem("Letter from GP"), null);
});

test("files are kept in the upload's own folder, with a safe name", () => {
  assert.equal(docFilePath("c1", "b1", 2, "My letter (final).pdf"), "c1/b1/2-My_letter_final_.pdf");
});

test("counts and sizes read as a person would say them", () => {
  assert.equal(docCountLabel(1), "1 document");
  assert.equal(docCountLabel(0), "0 documents");
  assert.equal(docCountLabel(4), "4 documents");
  assert.equal(docSizeLabel(200), "1 KB");
  assert.equal(docSizeLabel(320 * 1024), "320 KB");
  assert.equal(docSizeLabel(4.2 * 1024 * 1024), "4.2 MB");
});
