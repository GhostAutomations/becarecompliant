import test from "node:test";
import assert from "node:assert/strict";
import { carePlanExportName, carePlanFileName, carePlanPath, inCarePlanFolder } from "./care-plan-path.ts";

const CO = "84172279-54e4-4d5b-94b4-c92dc05c6baa";
const SU = "fa19f6df-943d-4f09-ac21-4a36883ebf00";

test("audit F13: the same file name uploaded twice lands in two different places", () => {
  const a = carePlanPath(CO, SU, "11111111-1111-4111-8111-111111111111", "Care plan.pdf");
  const b = carePlanPath(CO, SU, "22222222-2222-4222-8222-222222222222", "Care plan.pdf");
  assert.notEqual(a, b);
  assert.equal(a, `${CO}/care-plans/${SU}/11111111-1111-4111-8111-111111111111/Care_plan.pdf`);
  assert.ok(a.startsWith(`${CO}/care-plans/${SU}/`));
  assert.ok(inCarePlanFolder(a, CO, SU));
  assert.ok(inCarePlanFolder(b, CO, SU));
});

test("a name can never climb out of its folder or be empty", () => {
  for (const name of ["..", "../x", ".", "...pdf", "", "/etc/passwd", "a/../../b"]) {
    const p = carePlanPath(CO, SU, "u", name);
    assert.doesNotMatch(p, /(^|\/)\.\.(\/|$)/, name);
    assert.ok(inCarePlanFolder(p, CO, SU), name);
    assert.ok(carePlanFileName(name).length > 0, name);
  }
  assert.equal(carePlanFileName(".."), "care-plan");
});

test("a path in another service user's or company's folder is not this one's", () => {
  assert.equal(inCarePlanFolder(`${CO}/care-plans/other/x.pdf`, CO, SU), false);
  assert.equal(inCarePlanFolder(`other/care-plans/${SU}/x.pdf`, CO, SU), false);
  assert.equal(inCarePlanFolder(`${CO}/care-plans/${SU}/../other/x.pdf`, CO, SU), false);
});

test("export names: London date, current or earlier, then the file's own name", () => {
  // 23:30 UTC on 31 March 2026 is 00:30 on 1 April in London (BST).
  assert.equal(
    carePlanExportName({ uploadedAt: "2026-03-31T23:30:00Z", fileName: "plan.pdf", current: true }),
    "2026-04-01 current plan.pdf",
  );
  assert.equal(
    carePlanExportName({ uploadedAt: "2026-01-15T10:00:00Z", fileName: "Care plan.docx", current: false }),
    "2026-01-15 earlier Care_plan.docx",
  );
  assert.equal(carePlanExportName({ uploadedAt: null, fileName: "x.pdf", current: false }), "undated earlier x.pdf");
});
