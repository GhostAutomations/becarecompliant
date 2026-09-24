import test from "node:test";
import assert from "node:assert/strict";
import { narrativeLines, narrativePlainText, stripEmphasis } from "./narrative-text.ts";

test("DEF-066: the lines from Phil's pack of 24/09 lose their asterisks", () => {
  assert.equal(stripEmphasis("**Provider:** Thistle Care Ltd"), "Provider: Thistle Care Ltd");
  assert.equal(
    stripEmphasis("*This document is a preparation aid based on your own live compliance data.*"),
    "This document is a preparation aid based on your own live compliance data.",
  );
  assert.equal(
    stripEmphasis("1. **Complete the overdue Spot Check for Taiye Emmanuella Aladesuyi immediately** (Care and Support)"),
    "1. Complete the overdue Spot Check for Taiye Emmanuella Aladesuyi immediately (Care and Support)",
  );
});

test("a bold only line and a # line are headings; bullets become dots", () => {
  const lines = narrativeLines("## Readiness summary\n\n**Well-being: On track**\n- Customer satisfaction is strong\n---\nPlain sentence.");
  assert.deepEqual(lines, [
    { kind: "heading", text: "Readiness summary" },
    { kind: "heading", text: "Well-being: On track" },
    { kind: "paragraph", text: "•  Customer satisfaction is strong" },
    { kind: "paragraph", text: "Plain sentence." },
  ]);
});

test("ordinary text with an asterisk in a number is left alone", () => {
  assert.equal(stripEmphasis("3 * 4 checks"), "3 * 4 checks");
  assert.equal(stripEmphasis("snake_case_name stays"), "snake_case_name stays");
});

test("nothing with an asterisk survives in the plain text", () => {
  const t = narrativePlainText("**A** and *b* and __c__\n\n# D");
  assert.ok(!/[*#_]{1,2}\w/.test(t), t);
});

test("a theme and its status on two lines become one heading", () => {
  assert.deepEqual(narrativeLines("Well-being:\n\nOn track\n\nCustomer satisfaction is strong."), [
    { kind: "heading", text: "Well-being: On track" },
    { kind: "paragraph", text: "Customer satisfaction is strong." },
  ]);
  assert.deepEqual(narrativeLines("Care and Support:\nAction needed."), [
    { kind: "heading", text: "Care and Support: Action needed" },
  ]);
});

test("a line ending in a colon followed by ordinary text is left alone", () => {
  assert.deepEqual(narrativeLines("Next steps:\nBook the spot check."), [
    { kind: "paragraph", text: "Next steps:" },
    { kind: "paragraph", text: "Book the spot check." },
  ]);
});
