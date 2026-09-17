import { test } from "node:test";
import assert from "node:assert/strict";
import { rotaWeekGrid, ROTA_WEEKS } from "./format.ts";

test("four weeks, labelled Current, +1, +2, +3", () => {
  // Phil, 2026-09-17: "on the oncall rota, we need to add a 4th week, called +3".
  const weeks = rotaWeekGrid("2026-09-17");
  assert.equal(weeks.length, 4);
  assert.deepEqual(weeks.map((w) => w.label), ["Current", "+1", "+2", "+3"]);
});

test("the labels are derived from the count, so a fifth week is one number", () => {
  /* They were a hand written array beside a hand written length, which is how a grid comes to
     draw four weeks and label three. */
  const weeks = rotaWeekGrid("2026-09-17");
  assert.equal(weeks.length, ROTA_WEEKS);
  assert.equal(weeks[weeks.length - 1].label, `+${ROTA_WEEKS - 1}`);
});

test("every week runs Monday to Sunday and they are consecutive", () => {
  const weeks = rotaWeekGrid("2026-09-17"); // a Thursday
  assert.equal(weeks[0].days[0], "2026-09-14"); // the Monday of the current week
  for (const w of weeks) {
    assert.equal(w.days.length, 7);
    assert.equal(new Date(`${w.days[0]}T00:00:00Z`).getUTCDay(), 1, "a week must start on Monday");
    assert.equal(new Date(`${w.days[6]}T00:00:00Z`).getUTCDay(), 0, "a week must end on Sunday");
  }
  assert.equal(weeks[3].days[6], "2026-10-11"); // 28 days of rota, not 21
});

test("a Sunday belongs to the week that is ending, not the one about to start", () => {
  /* getUTCDay is 0 on Sunday, and the naive 1 - dow sends it FORWARD six days: on a Sunday the
     rota would have jumped to next week and the person working that night would not be on it. */
  const weeks = rotaWeekGrid("2026-09-20"); // Sunday
  assert.equal(weeks[0].days[0], "2026-09-14");
  assert.equal(weeks[0].days[6], "2026-09-20");
});

test("it crosses a month end and a year end without losing a day", () => {
  const dec = rotaWeekGrid("2026-12-28");
  assert.equal(dec[0].days[0], "2026-12-28");
  assert.equal(dec[3].days[6], "2027-01-24");
  const all = dec.flatMap((w) => w.days);
  assert.equal(new Set(all).size, 28, "28 distinct days");
});
