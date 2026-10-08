import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOTICE_MAX_BYTES,
  noticeFilePath,
  noticeFileProblem,
  noticeFilesProblem,
  noticeParagraphs,
  noticeProblem,
  noticeSubject,
} from "./notice-rules.ts";

test("PDF, Word, Excel and pictures are allowed, nothing else", () => {
  for (const n of ["a.pdf", "a.DOCX", "a.doc", "a.xlsx", "a.xls", "a.jpg", "a.png", "a.heic"]) {
    assert.equal(noticeFileProblem({ name: n, size: 10 }), null, n);
  }
  assert.match(noticeFileProblem({ name: "a.exe", size: 10 }) ?? "", /cannot be attached/);
  assert.match(noticeFileProblem({ name: "a.zip", size: 10 }) ?? "", /cannot be attached/);
  assert.match(noticeFileProblem({ name: "a.pdf", size: 0 }) ?? "", /empty/);
  assert.match(noticeFileProblem({ name: "a.pdf", size: NOTICE_MAX_BYTES + 1 }) ?? "", /over 10 MB/);
});

test("at most three files", () => {
  const f = { name: "a.pdf", size: 1 };
  assert.equal(noticeFilesProblem([f, f, f]), null);
  assert.match(noticeFilesProblem([f, f, f, f]) ?? "", /up to 3/);
});

test("each kind needs what makes it that kind", () => {
  assert.equal(noticeProblem({ kind: "memo", title: "T", body: "Words", fileCount: 0 }), null);
  assert.match(noticeProblem({ kind: "memo", title: "T", body: " ", fileCount: 2 }) ?? "", /Write the memo/);
  assert.match(noticeProblem({ kind: "message", title: "T", body: "", fileCount: 0 }) ?? "", /Write the message/);
  assert.equal(noticeProblem({ kind: "message", title: "T", body: "Hi", fileCount: 1 }), null);
  assert.match(noticeProblem({ kind: "attachment", title: "T", body: "", fileCount: 0 }) ?? "", /Attach at least one/);
  assert.equal(noticeProblem({ kind: "attachment", title: "T", body: "", fileCount: 1 }), null);
  assert.match(noticeProblem({ kind: "memo", title: "  ", body: "x", fileCount: 0 }) ?? "", /title/);
  assert.match(noticeProblem({ kind: "board", title: "T", body: "x", fileCount: 0 }) ?? "", /Choose/);
  assert.match(noticeProblem({ kind: "message", title: "T", body: "x".repeat(2001), fileCount: 0 }) ?? "", /memo/);
});

test("file paths sit under the notice and are safe", () => {
  assert.equal(noticeFilePath("c", "n", 2, "Rota (May) v2.xlsx"), "c/notices/n/2-Rota_May_v2.xlsx");
});

test("subjects say what is asked", () => {
  assert.equal(noticeSubject("memo", "read", "Car parking"), "New memo: Car parking");
  assert.equal(noticeSubject("message", "confirm", "Bank holiday"), "New message: Bank holiday");
  assert.equal(noticeSubject("attachment", "read", "Rota"), "Documents for you: Rota");
  assert.equal(noticeSubject("memo", "sign", "Lone working"), "Please read and sign: Lone working");
});

test("paragraphs split on blank lines and keep single line breaks", () => {
  assert.deepEqual(noticeParagraphs("One\r\nstill one\n\n\nTwo  \n \nThree"), ["One\nstill one", "Two", "Three"]);
  assert.deepEqual(noticeParagraphs(null), []);
});
