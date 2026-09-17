import { test } from "node:test";
import assert from "node:assert/strict";
import { appraisalDueMet } from "./appraisal-due.ts";

test("an appraisal done after its Supervision 3 has discharged the deadline", () => {
  // Chloe Driscoll: Sup 3 on 03/04/2026 makes the appraisal due 22/06/2026, and she was
  // appraised early on 05/06/2026. Measured against the DUE date she reads as outstanding.
  assert.equal(appraisalDueMet("2026-04-03", "2026-06-05"), true);
});

test("done on the day it fell due counts, late counts too", () => {
  // Janet Oladunni: Sup 3 on 14/04/2026, due 03/07/2026, appraised 03/07/2026.
  assert.equal(appraisalDueMet("2026-04-14", "2026-07-03"), true);
  assert.equal(appraisalDueMet("2026-04-14", "2026-09-01"), true);
});

test("an appraisal from the PREVIOUS cycle settles nothing", () => {
  // Mary Ikpi-Ubi: appraised 18/12/2025, then supervised on 24/08/2026. The appraisal that
  // supervision triggered is still owed, so the cell keeps its pill.
  assert.equal(appraisalDueMet("2026-08-24", "2025-12-18"), false);
});

test("an appraisal on the anchor day itself settles nothing", () => {
  // Same day is the supervision, not the appraisal that follows it.
  assert.equal(appraisalDueMet("2026-04-14", "2026-04-14"), false);
});

test("no anchor, or no appraisal, is never met", () => {
  assert.equal(appraisalDueMet(null, "2026-07-03"), false);
  assert.equal(appraisalDueMet("2026-07-03", null), false);
  assert.equal(appraisalDueMet(null, null), false);
});
