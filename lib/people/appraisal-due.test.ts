import { test } from "node:test";
import assert from "node:assert/strict";
import { appraisalDueMet } from "./appraisal-due.ts";

test("an appraisal done on its due date has met it", () => {
  // Janet Oladunni, exactly as migrated: due 03/07/2026, appraised 03/07/2026.
  assert.equal(appraisalDueMet("2026-07-03", "2026-07-03"), true);
});

test("an appraisal done after its due date has still met it, late", () => {
  assert.equal(appraisalDueMet("2026-07-03", "2026-07-20"), true);
});

test("an appraisal done before a due date that has since passed has NOT met it", () => {
  // The cycle that came due on 03/07 is outstanding: the appraisal on 01/07 closed the one before.
  assert.equal(appraisalDueMet("2026-07-03", "2026-07-01"), false);
});

test("no due date, or no appraisal, is never met", () => {
  assert.equal(appraisalDueMet(null, "2026-07-03"), false);
  assert.equal(appraisalDueMet("2026-07-03", null), false);
  assert.equal(appraisalDueMet(null, null), false);
});
