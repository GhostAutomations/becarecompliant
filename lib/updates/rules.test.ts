import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UPDATE_MAX_BYTES,
  mentionQuery,
  mentionedIds,
  orderThreads,
  previewText,
  splitMentions,
  tileUpdate,
  updateCount,
  updateFilePath,
  updateFileProblem,
  updateFilesProblem,
  updateMimeType,
  updatePostProblem,
  updateStamp,
  sizeLabel,
} from "./rules.ts";

const row = (id: string, createdAt: string, over: Partial<{ parentId: string | null; pinnedAt: string | null; removedAt: string | null; body: string }> = {}) => ({
  id,
  createdAt,
  parentId: over.parentId ?? null,
  pinnedAt: over.pinnedAt ?? null,
  removedAt: over.removedAt ?? null,
  body: over.body ?? id,
});

test("photos, PDFs, Word and Excel are accepted; anything else is refused", () => {
  for (const n of ["a.jpg", "a.JPEG", "a.png", "a.heic", "a.pdf", "a.docx", "a.xlsx"]) {
    assert.equal(updateFileProblem({ name: n, size: 10 }), null, n);
  }
  assert.match(updateFileProblem({ name: "a.exe", size: 10 })!, /cannot be attached/);
  assert.match(updateFileProblem({ name: "a.doc", size: 10 })!, /cannot be attached/);
  assert.match(updateFileProblem({ name: "noextension", size: 10 })!, /cannot be attached/);
});

test("20 MB is the limit, and an empty file is refused", () => {
  assert.equal(updateFileProblem({ name: "a.pdf", size: UPDATE_MAX_BYTES }), null);
  assert.match(updateFileProblem({ name: "a.pdf", size: UPDATE_MAX_BYTES + 1 })!, /over 20 MB/);
  assert.match(updateFileProblem({ name: "a.pdf", size: 0 })!, /empty/);
});

test("five files at most", () => {
  const f = { name: "a.pdf", size: 1 };
  assert.equal(updateFilesProblem([f, f, f, f, f]), null);
  assert.match(updateFilesProblem([f, f, f, f, f, f])!, /up to 5/);
});

test("words or a file are needed, and 5000 characters is the most", () => {
  assert.match(updatePostProblem("   ", 0)!, /Write something/);
  assert.equal(updatePostProblem("", 1), null);
  assert.equal(updatePostProblem("x".repeat(5000), 0), null);
  assert.match(updatePostProblem("x".repeat(5001), 0)!, /5000/);
});

test("the file path sits in the update's own folder, with a safe name", () => {
  assert.equal(updateFilePath("co", "up", 2, "My photo (1).JPG"), "co/up/2-My_photo_1_.JPG");
  assert.equal(updateMimeType("x.XLSX"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
});

test("oldest at the top, replies under their update, the pinned one first", () => {
  const rows = [
    row("c", "2026-09-24T10:00:00Z"),
    row("a", "2026-09-22T10:00:00Z"),
    row("r2", "2026-09-23T12:00:00Z", { parentId: "a" }),
    row("r1", "2026-09-23T11:00:00Z", { parentId: "a" }),
    row("b", "2026-09-23T10:00:00Z", { pinnedAt: "2026-09-24T11:00:00Z" }),
    row("orphan", "2026-09-23T10:00:00Z", { parentId: "gone" }),
  ];
  const t = orderThreads(rows);
  assert.deepEqual(t.map((x) => x.update.id), ["b", "a", "c"]);
  assert.deepEqual(t[1].replies.map((r) => r.id), ["r1", "r2"]);
});

test("a removed update is never shown as pinned", () => {
  const rows = [row("a", "2026-09-22T10:00:00Z"), row("b", "2026-09-23T10:00:00Z", { pinnedAt: "x", removedAt: "y" })];
  assert.deepEqual(orderThreads(rows).map((x) => x.update.id), ["a", "b"]);
});

test("the tile shows the pinned update, else the newest standing one", () => {
  const rows = [
    row("a", "2026-09-22T10:00:00Z"),
    row("b", "2026-09-23T10:00:00Z", { removedAt: "x" }),
    row("r", "2026-09-24T10:00:00Z", { parentId: "a" }),
  ];
  assert.equal(tileUpdate(rows)?.id, "a");
  rows.push(row("p", "2026-09-01T10:00:00Z", { pinnedAt: "x" }));
  assert.equal(tileUpdate(rows)?.id, "p");
  assert.equal(tileUpdate([]), null);
  assert.equal(updateCount(rows), 3);
});

test("the tile preview is cut on a word", () => {
  assert.equal(previewText("short"), "short");
  const long = "word ".repeat(50);
  const p = previewText(long, 20);
  assert.ok(p.endsWith("…"));
  assert.ok(p.length <= 21);
});

test("only mentions still in the words are emailed", () => {
  const picked = [
    { id: "1", name: "Bev Admin" },
    { id: "2", name: "Sam Jones" },
  ];
  assert.deepEqual(mentionedIds("Thanks @Bev Admin, done", picked), ["1"]);
  assert.deepEqual(mentionedIds("no one", picked), []);
});

test("mentions are split out for highlighting, longest name first", () => {
  const parts = splitMentions("Hi @Bev Admin and @Bev", ["Bev", "Bev Admin"]);
  assert.deepEqual(parts, [
    { text: "Hi ", mention: false },
    { text: "@Bev Admin", mention: true },
    { text: " and ", mention: false },
    { text: "@Bev", mention: true },
  ]);
  assert.deepEqual(splitMentions("email me@x.com", []), [{ text: "email me@x.com", mention: false }]);
});

test("the @ being typed is found at the caret", () => {
  assert.deepEqual(mentionQuery("Hello @Be", 9), { start: 6, query: "Be" });
  assert.deepEqual(mentionQuery("@", 1), { start: 0, query: "" });
  assert.equal(mentionQuery("me@x", 4), null);
  assert.equal(mentionQuery("Hello", 5), null);
  assert.equal(mentionQuery("@Bev\nnext", 9), null);
});

test("the time is shown in UK time, across the clock change", () => {
  assert.equal(updateStamp("2026-09-24T08:14:00Z"), "24/09/2026 09:14");
  assert.equal(updateStamp("2026-12-01T08:14:00Z"), "01/12/2026 08:14");
  assert.equal(updateStamp("2026-10-24T23:30:00Z"), "25/10/2026 00:30");
  assert.equal(updateStamp("nonsense"), "");
  assert.equal(sizeLabel(2 * 1024 * 1024), "2.0 MB");
  assert.equal(sizeLabel(10), "1 KB");
});
