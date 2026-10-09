import { test } from "node:test";
import assert from "node:assert/strict";
import { appraisalDueMet, appraisalDoneShown } from "./appraisal-due.ts";

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

test("an appraisal on the same day as Supervision 3 settles it (one meeting, Phil 9 Oct 2026)", () => {
  // The supervision side counts that Supervision 3 as closed by this appraisal, so the appraisal
  // must not be offered again: it would go gold with a Complete button the moment it was done.
  assert.equal(appraisalDueMet("2026-04-14", "2026-04-14"), true);
  assert.equal(appraisalDoneShown("2026-07-03", appraisalDueMet("2026-04-14", "2026-04-14"), "2026-04-14"), "2026-04-14");
  // A day earlier still belongs to the previous cycle.
  assert.equal(appraisalDueMet("2026-04-14", "2026-04-13"), false);
});

test("no anchor, or no appraisal, is never met", () => {
  assert.equal(appraisalDueMet(null, "2026-07-03"), false);
  assert.equal(appraisalDueMet("2026-07-03", null), false);
  assert.equal(appraisalDueMet(null, null), false);
});

test("the Done cell clears once the next appraisal is due, and fills again when it is done", () => {
  // Mary Ikpi-Ubi: appraised 18/12/2025, Supervision 3 on 24/08/2026, next appraisal due 12/11/2026.
  assert.equal(appraisalDoneShown("2026-11-12", appraisalDueMet("2026-08-24", "2025-12-18"), "2025-12-18"), null);
  // Appraised on 01/11/2026, after that Supervision 3: the deadline is met, the date shows.
  assert.equal(appraisalDoneShown("2026-11-12", appraisalDueMet("2026-08-24", "2026-11-01"), "2026-11-01"), "2026-11-01");
  // No next appraisal due yet (Supervision 3 not done): the last one shows.
  assert.equal(appraisalDoneShown(null, false, "2025-12-18"), "2025-12-18");
});
