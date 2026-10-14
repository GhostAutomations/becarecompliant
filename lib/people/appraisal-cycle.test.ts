import test from "node:test";
import assert from "node:assert/strict";
import { appraisalSlot } from "./appraisal-cycle.ts";
import { supervisionsConsumed } from "./supervision-cycle.ts";
import { addInterval, formatCivilDate, parseCivilDate } from "../recurrence.ts";

const TODAY = { year: 2026, month: 10, day: 14 };
const plus80 = (d: string) => formatCivilDate(addInterval(parseCivilDate(d), "day", 80));

/*
 * THE REGRESSION (THE LIST 58). A carer with two ad hoc supervisions in the cycle before her
 * appraisal: five supervisions, then the appraisal, then two more. Counting three per appraisal put
 * her current cycle at 20/10/2025, so the Due cell read 05/09/2026 in red and Done was blank.
 */
test("extra supervisions before the appraisal: due blank, done shown, on time", () => {
  const sups = ["2025-04-14", "2025-05-13", "2025-08-01", "2025-10-20", "2026-01-08", "2026-06-17", "2026-09-05"];
  const apps = ["2026-03-29"];
  // The supervision columns' split: Sup 1 17/06, Sup 2 05/09, Sup 3 due 80 days after Sup 2.
  const current = sups.slice(supervisionsConsumed(sups, apps[0]));
  assert.deepEqual(current, ["2026-06-17", "2026-09-05"]);
  assert.equal(plus80(current[1]), "2026-11-24");
  // Supervision 3 is the outstanding slot, so its Done cell (thirdSupDone) is empty.
  const a = appraisalSlot(apps, sups, 80, 14, TODAY, null);
  assert.equal(a.nextDue, null);
  assert.equal(a.nextDueRag, "none");
  assert.equal(a.doneShown, "2026-03-29");
  // Judged against Supervision 3 of the closed cycle: 08/01/2026 + 80 = 29/03/2026, the same day.
  assert.equal(a.compRag, "green");
});

test("a regular history (three then an appraisal, twice) gives what it always did", () => {
  const sups = ["2025-01-10", "2025-04-01", "2025-06-20", "2025-11-20", "2026-02-08", "2026-04-29"];
  const apps = ["2025-09-01"];
  const a = appraisalSlot(apps, sups, 80, 14, TODAY, "2026-04-29");
  assert.equal(a.nextDue, "2026-07-18");
  assert.equal(a.nextDueRag, "red");
  assert.equal(a.nextDueMet, false);
  assert.equal(a.doneShown, null);
  assert.equal(a.compRag, "green"); // 01/09/2025 against 20/06/2025 + 80 = 08/09/2025

  const done = appraisalSlot([...apps, "2026-07-10"], sups, 80, 14, TODAY, "2026-04-29");
  assert.equal(done.nextDueMet, true);
  assert.equal(done.nextDueRag, "none");
  assert.equal(done.doneShown, "2026-07-10");
  assert.equal(done.compRag, "green");
});

test("one appraisal with only one supervision before it", () => {
  const sups = ["2026-01-15", "2026-05-20", "2026-08-10"];
  const a = appraisalSlot(["2026-03-01"], sups, 80, 14, TODAY, null);
  assert.equal(a.nextDue, null);
  assert.equal(a.doneShown, "2026-03-01");
  assert.equal(a.compRag, "green"); // 15/01/2026 + 80 = 05/04/2026
});

test("a previous cycle with only two supervisions, appraised early", () => {
  const sups = ["2026-01-05", "2026-04-03"];
  // Nothing done since, so slot 3 shows the previous cycle's last supervision.
  const a = appraisalSlot(["2026-06-05"], sups, 80, 14, TODAY, "2026-04-03");
  assert.equal(a.nextDue, "2026-06-22");
  assert.equal(a.nextDueMet, true);
  assert.equal(a.nextDueRag, "none");
  assert.equal(a.doneShown, "2026-06-05");
  assert.equal(a.compRag, "green");
});

test("an appraisal on the same day as Supervision 3 counts as done (2026-10-09 rule)", () => {
  const sups = ["2026-01-01", "2026-03-20", "2026-06-08"];
  const a = appraisalSlot(["2026-06-08"], sups, 80, 14, TODAY, "2026-06-08");
  assert.equal(a.nextDueMet, true);
  assert.equal(a.nextDueRag, "none");
  assert.equal(a.doneShown, "2026-06-08");
  assert.equal(a.compRag, "green");
});

test("more than three supervisions in the current cycle: due from the third", () => {
  const sups = ["2025-10-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"];
  // Without the Done cell (the backfill), the third supervision since the appraisal anchors it.
  const a = appraisalSlot(["2026-01-10"], sups, 80, 14, TODAY);
  assert.equal(a.nextDue, "2026-06-20");
  assert.equal(a.nextDueRag, "red");
  assert.equal(a.doneShown, null);
});

test("an appraisal judged late against the last supervision before it", () => {
  // 17/02/2026 + 80 = 08/05/2026; appraised 25/05/2026.
  const a = appraisalSlot(["2026-05-25"], ["2025-12-02", "2026-02-17", "2026-08-13"], 80, 14, TODAY, "2026-02-17");
  assert.equal(a.compRag, "red");
});

test("no appraisal ever: due only once the third supervision is done", () => {
  const sups = ["2026-01-10", "2026-04-01"];
  const two = appraisalSlot([], sups, 80, 14, TODAY, null);
  assert.equal(two.nextDue, null);
  assert.equal(two.comp, null);
  assert.equal(two.compRag, "none");
  const three = appraisalSlot([], [...sups, "2026-06-20"], 80, 14, TODAY, "2026-06-20");
  assert.equal(three.nextDue, "2026-09-08");
  assert.equal(three.nextDueRag, "red");
  assert.equal(three.doneShown, null);
});

test("no interval set: nothing is due", () => {
  const a = appraisalSlot([], ["2026-01-10", "2026-04-01", "2026-06-20"], null, 14, TODAY, "2026-06-20");
  assert.equal(a.nextDue, null);
});
