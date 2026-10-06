import { test } from "node:test";
import assert from "node:assert/strict";
import { joinSections, nationOf, parseImproveReview, sourcesSection, writeSystemPrompt } from "./ai-prompt.ts";

test("the nation follows the regulator", () => {
  assert.deepEqual(nationOf("ciw").regions, ["wales"]);
  assert.deepEqual(nationOf("cqc").regions, ["england"]);
  assert.deepEqual(nationOf(null).regions, ["wales", "england"]);
});

test("the writer is told to cite, not invent, and not to use dashes", () => {
  const s = writeSystemPrompt("Wales");
  assert.match(s, /Never invent law/);
  assert.match(s, /\[S2\]/);
  assert.match(s, /Never use dashes/);
});

test("the improver's JSON is read even inside a code fence", () => {
  const raw = "```json\n" + JSON.stringify({ summary: "OK", gaps: [{ issue: "No PSOW", severity: "high", source: "S3" }], sections: [{ heading: "Purpose", original: "a", proposed: "b", reason: "r" }] }) + "\n```";
  const r = parseImproveReview(raw)!;
  assert.equal(r.sections[0].proposed, "b");
  assert.equal(r.gaps[0].severity, "high");
  assert.equal(parseImproveReview("not json"), null);
  assert.equal(parseImproveReview(JSON.stringify({ sections: [] })), null);
});

test("chosen sections join into one policy, and only cited sources are listed", () => {
  const body = joinSections("Complaints", [{ heading: "Purpose", text: "To help [S1]." }, { heading: "Scope", text: "" }]);
  assert.equal(body, "# Complaints\n\n# Purpose\nTo help [S1].");
  const src = sourcesSection(
    [{ n: 1, title: "Reg 64", publisher: "legislation.gov.uk", url: "u1", checkedOn: "06/10/2026" }, { n: 2, title: "PSOW", publisher: "PSOW", url: "u2", checkedOn: "06/10/2026" }],
    body,
  );
  assert.match(src, /\[S1\] Reg 64/);
  assert.doesNotMatch(src, /PSOW/);
});
