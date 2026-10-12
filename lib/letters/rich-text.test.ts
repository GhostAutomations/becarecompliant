import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blocksToLetterHtml,
  isLetterHtml,
  letterEmailHtml,
  letterPlainText,
  mergeLetterHtml,
  parseLetterHtml,
  pdfBlocks,
  plainTextBlocks,
  splitLetterHtml,
  toLetterHtml,
} from "./rich-text.ts";

test("old plain text letters read as they always did", () => {
  const text = "Dear reader\n\nDate: Monday\nTime: 10:00\n\n\nSome text.\n• First\n• Second";
  const blocks = plainTextBlocks(text);
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["para", "para", "space", "para", "list"],
  );
  const pdf = pdfBlocks(text);
  assert.equal(pdf[1].kind, "details");
  assert.deepEqual(pdf[1].kind === "details" ? pdf[1].rows : null, [
    { label: "Date", value: "Monday" },
    { label: "Time", value: "10:00" },
  ]);
});

test("the editor's HTML keeps every allowed format and nothing else", () => {
  const html =
    '<h2>Heading</h2><h3>Sub</h3><p>A <strong>bold</strong>, <em>italic</em> and <u>underlined</u> word, ' +
    '<span data-size="large">big</span> and <span data-size="small">small</span>.</p>' +
    "<ul><li><p>One</p></li><li><p>Two</p></li></ul><ol><li><p>First</p></li></ol><p></p><p>End</p>";
  assert.equal(toLetterHtml(html), html);
});

test("Word and web paste arrives clean: no styles, classes, scripts or unknown tags", () => {
  const word =
    '<p class="MsoNormal" style="font-family:Comic Sans;color:red"><b><span style="font-size:20pt">Hello</span></b> ' +
    '<a href="https://x">there</a><o:p></o:p></p><script>alert(1)</script><style>p{}</style><table><tr><td>cell</td></tr></table>';
  assert.equal(toLetterHtml(word), "<p><strong>Hello</strong> there</p><p>cell</p>");
});

test("text is escaped on the way out, so typed angle brackets stay text", () => {
  assert.equal(toLetterHtml("<p>a &lt;b&gt; &amp; c</p>"), "<p>a &lt;b&gt; &amp; c</p>");
  assert.equal(toLetterHtml("5 < 6 & 7"), "<p>5 &lt; 6 &amp; 7</p>");
});

test("a list inside a list is flattened into one list, and later blocks are kept", () => {
  const html = "<ul><li><p>A</p><ul><li><p>B</p></li></ul></li><li><p>C</p></li></ul><p>After</p>";
  const blocks = parseLetterHtml(html);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind === "list" ? blocks[0].items.length : 0, 3);
  assert.equal(blocks[1].kind, "para");
});

test("a size set outside still applies inside a span with no size", () => {
  const blocks = parseLetterHtml('<p><span data-size="large">big <span>still big</span></span></p>');
  assert.deepEqual(blocks[0].kind === "para" ? blocks[0].lines[0] : null, [{ text: "big still big", size: "large" }]);
});

test("isLetterHtml tells the editor's text from an old plain letter", () => {
  assert.equal(isLetterHtml("<p>Hi</p>"), true);
  assert.equal(isLetterHtml("  <ul><li>x</li></ul>"), true);
  assert.equal(isLetterHtml("Dear Jo\n\nHello"), false);
  assert.equal(isLetterHtml("<b>bold first</b>"), false);
});

test("plain text for the record keeps lists, numbers and spacing", () => {
  const html = "<p>Intro</p><ul><li><p>One</p></li></ul><ol><li><p>A</p></li><li><p>B</p></li></ol><p></p><p>End</p>";
  assert.equal(letterPlainText(html), "Intro\n\n• One\n\n1. A\n2. B\n\n\nEnd");
});

test("tokens merge escaped, unknown tokens stay visible", () => {
  const out = mergeLetterHtml("<p>Dear {{name}}, {{unknown}}</p>", { name: "O'Brien & <Sons>" });
  assert.equal(out, "<p>Dear O&#39;Brien &amp; &lt;Sons&gt;, {{unknown}}</p>");
});

test("a block token alone in its paragraph is replaced by the blocks whole", () => {
  const out = mergeLetterHtml("<p>Before</p><p>{{outcome_body}}</p><p>After</p>", {}, {
    outcome_body: "<p>Middle <strong>one</strong></p><ul><li><p>x</p></li></ul>",
  });
  assert.equal(out, "<p>Before</p><p>Middle <strong>one</strong></p><ul><li><p>x</p></li></ul><p>After</p>");
});

test("splitting into blocks and joining again gives the same letter", () => {
  const html = "<p>A</p><h2>B</h2><ul><li><p>C</p></li></ul>";
  assert.equal(splitLetterHtml(html).join(""), html);
  assert.equal(blocksToLetterHtml(parseLetterHtml(html)), html);
});

test("the email version is styled inline and escaped", () => {
  const out = letterEmailHtml("<p>Hi <strong>you</strong> &amp; me</p>");
  assert.match(out, /^<p style="margin:0 0 14px 0;">Hi <strong>you<\/strong> &amp; me<\/p>$/);
});

test("a paragraph that is only an empty token is left out, not printed as a gap", () => {
  assert.equal(mergeLetterHtml("<p>A</p><p>{{stage_action_sentence}}</p><p>B</p>", { stage_action_sentence: "" }), "<p>A</p><p>B</p>");
  assert.equal(mergeLetterHtml("<p>A</p><p>{{x}}</p>", { x: "kept" }), "<p>A</p><p>kept</p>");
});

test("a block token is filled even when its value is listed as empty (the lost outcome, Thistle 12 Oct)", () => {
  const out = mergeLetterHtml(
    "<p>Thank you for attending.</p><p>{{outcome_body}}</p><p>Appeal wording.</p>",
    { outcome_body: "" },
    { outcome_body: "<p>What was discussed.</p><p>The outcome.</p>" },
  );
  assert.equal(out, "<p>Thank you for attending.</p><p>What was discussed.</p><p>The outcome.</p><p>Appeal wording.</p>");
});
