import { test } from "node:test";
import assert from "node:assert/strict";
import { noticeEmailBodyHtml, noticePlainText, parseNoticeText } from "./notice-text.ts";

test("bullets, numbers, headings and bold are understood", () => {
  const b = parseNoticeText("# Car park\n\nFrom **Monday** only visitors.\nThe gate code stays.\n\n- Park on Station Road\n• Walk round\n1. First\n2) Second\n\nThanks");
  assert.deepEqual(b.map((x) => x.kind), ["heading", "para", "bullet", "bullet", "numbered", "numbered", "para"]);
  const para = b[1] as { kind: "para"; lines: { text: string; bold: boolean }[][] };
  assert.equal(para.lines.length, 2);
  assert.deepEqual(para.lines[0][1], { text: "Monday", bold: true });
  assert.equal((b[5] as { marker: string }).marker, "2)");
});

test("nothing is guessed: a short line stays a line", () => {
  const b = parseNoticeText("Hi all\n\nPlease read this.");
  assert.deepEqual(b.map((x) => x.kind), ["para", "para"]);
});

test("plain text and email html keep the meaning and escape everything", () => {
  const b = parseNoticeText("- <script>x</script>\n- **two**\n\nA & B");
  assert.equal(noticePlainText(b), "• <script>x</script>\n\n• two\n\nA & B");
  const html = noticeEmailBodyHtml(b);
  assert.match(html, /<ul[^>]*><li[^>]*>&lt;script&gt;x&lt;\/script&gt;<\/li><li[^>]*><strong[^>]*>two<\/strong><\/li><\/ul>/);
  assert.match(html, /A &amp; B/);
});

test("empty input gives nothing", () => {
  assert.deepEqual(parseNoticeText(""), []);
  assert.deepEqual(parseNoticeText(null), []);
});
