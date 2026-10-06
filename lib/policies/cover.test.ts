import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanReference, coverFromForm, coverFromStored, DEFAULT_COVER, referencePrefix } from "./cover.ts";

test("cover choices come from the lists, anything else falls back", () => {
  const c = coverFromForm((k) => ({ applies_to: "Care and support staff", read_by: "nonsense", classification: "Public", approver_id: " abc " } as Record<string, string>)[k]);
  assert.equal(c.applies_to, "Care and support staff");
  assert.equal(c.read_by, DEFAULT_COVER.read_by);
  assert.equal(c.classification, "Public");
  assert.equal(c.approver_id, "abc");
  assert.deepEqual(coverFromStored(null), DEFAULT_COVER);
});

test("reference areas and typed references", () => {
  assert.equal(referencePrefix(["hr"]), "HR");
  assert.equal(referencePrefix(["ciw", "cqc"]), "CARE");
  assert.equal(referencePrefix([]), "GEN");
  assert.equal(cleanReference(" qp 12 "), "QP-12");
  assert.equal(cleanReference(""), null);
  assert.equal(cleanReference("<script>"), null);
});
