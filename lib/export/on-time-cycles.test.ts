import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCivilDate, formatCivilDate, addInterval, type CivilDate } from "../recurrence.ts";
import { dueDatesInGap, cycleOnTime, buildAnchors } from "./on-time-cycles.ts";

const d = (iso: string) => parseCivilDate(iso);
const isoOf = (c: CivilDate) => formatCivilDate(c);
/** Supervision as Acme runs it: a 90 day reporting deadline. */
const every90 = (from: CivilDate) => addInterval(from, "day", 90);
const TODAY = d("2026-07-30");
/** The default PQS window: the last six months. */
const FROM = d("2026-01-30");
/** Far enough back to keep nothing out of a test that is not about the window. */
const ALL = d("1900-01-01");

test("a check never done keeps falling due, it does not stop at the first cycle", () => {
  // Started 01/05/2022 and never supervised. The OLD walk produced exactly one due date,
  // 30/07/2022, which fell outside any recent window, so the person vanished from the measure.
  const dues = dueDatesInGap({ anchor: d("2022-05-01"), next: null, today: TODAY, from: ALL, step: every90 });
  assert.equal(isoOf(dues[0]), "2022-07-30");
  assert.ok(dues.length > 16, `expected four years of missed cycles, got ${dues.length}`);
  // Two of them land in the last six months, which is what the PQS window asks for.
  const inWindow = dues.filter((x) => isoOf(x) >= "2026-01-30" && isoOf(x) <= "2026-07-30");
  assert.equal(inWindow.length, 2);
});

test("cycles before the window start are never collected in the first place", () => {
  const all = dueDatesInGap({ anchor: d("2022-05-01"), next: null, today: TODAY, from: ALL, step: every90 });
  const windowed = dueDatesInGap({ anchor: d("2022-05-01"), next: null, today: TODAY, from: FROM, step: every90 });
  assert.equal(windowed.length, 2);
  assert.deepEqual(windowed, all.slice(all.length - 2));
});

test("a long outstanding check still reaches the window (the old cap kept the wrong end)", () => {
  // A weekly check anchored in 2015. Capping at 400 cycles and keeping the OLDEST 400 stopped
  // in 2022, so the record dropped out of a 2026 window entirely.
  const weekly = (from: CivilDate) => addInterval(from, "day", 7);
  const dues = dueDatesInGap({ anchor: d("2015-01-01"), next: null, today: TODAY, from: FROM, step: weekly });
  assert.ok(dues.length >= 25, `expected roughly six months of weekly cycles, got ${dues.length}`);
  assert.ok(isoOf(dues[0]) >= "2026-01-30");
  assert.ok(isoOf(dues[dues.length - 1]) < "2026-07-30");
});

test("the cycle running right now is not counted, it is not late yet", () => {
  const dues = dueDatesInGap({ anchor: d("2026-07-01"), next: null, today: TODAY, from: ALL, step: every90 });
  assert.deepEqual(dues, []); // due 29/09/2026, still open
});

test("a cycle due TODAY is not late, it has until the end of the day", () => {
  // 01/05/2026 plus 90 days is exactly 30/07/2026, which is today.
  const dues = dueDatesInGap({ anchor: d("2026-05-01"), next: null, today: TODAY, from: ALL, step: every90 });
  assert.deepEqual(dues, []);
});

test("done before the due date is one cycle, on time", () => {
  const next = d("2026-06-01");
  const dues = dueDatesInGap({ anchor: d("2026-04-01"), next, today: TODAY, from: ALL, step: every90 });
  assert.equal(dues.length, 1);
  assert.equal(isoOf(dues[0]), "2026-06-30");
  assert.deepEqual(cycleOnTime(dues, 0, next), { settled: true, onTime: true });
});

test("done after the due date is one cycle, late", () => {
  const next = d("2026-07-15");
  const dues = dueDatesInGap({ anchor: d("2026-04-01"), next, today: TODAY, from: ALL, step: every90 });
  assert.equal(dues.length, 1);
  assert.deepEqual(cycleOnTime(dues, 0, next), { settled: true, onTime: false });
});

test("a long gap between two completions is several missed cycles, not one", () => {
  // Done 01/01/2025, not done again until 01/07/2026: eighteen months at 90 days.
  const next = d("2026-07-01");
  const dues = dueDatesInGap({ anchor: d("2025-01-01"), next, today: TODAY, from: ALL, step: every90 });
  assert.equal(dues.length, 6);
  // Only the last one is the cycle that completion discharges, and it is late.
  assert.deepEqual(cycleOnTime(dues, 5, next), { settled: true, onTime: false });
  // The five before it were never done at all, so they carry no completion date.
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(cycleOnTime(dues, i, next), { settled: false, onTime: false });
  }
});

test("trimming to the window leaves the settled cycle last, so credit lands on the right one", () => {
  const next = d("2026-07-01");
  const dues = dueDatesInGap({ anchor: d("2025-01-01"), next, today: TODAY, from: FROM, step: every90 });
  assert.equal(dues.length, 2); // 30/03/2026 and 28/06/2026
  assert.deepEqual(cycleOnTime(dues, 1, next), { settled: true, onTime: false });
  assert.deepEqual(cycleOnTime(dues, 0, next), { settled: false, onTime: false });
});

test("a monthly check steps by calendar month, not by 30 days", () => {
  const monthly = (from: CivilDate) => addInterval(from, "month", 1);
  const dues = dueDatesInGap({ anchor: d("2026-01-31"), next: d("2026-05-01"), today: TODAY, from: ALL, step: monthly });
  assert.equal(isoOf(dues[0]), "2026-02-28");
  assert.ok(dues.length >= 2);
});

test("a start date later than the evidence never settles a cycle", () => {
  // Live shape: start 01/08/2026 with supervisions dated 19/07/2026. Sorting the start date in
  // among the completions made it the "next" of the preceding gap, which credited a cycle as
  // completed on a date no evidence supports.
  const anchors = buildAnchors(d("2026-08-01"), [d("2026-07-19")]);
  assert.deepEqual(anchors.map(isoOf), ["2026-07-19"]);
});

test("two completions on the same day raise one cycle, not two", () => {
  const anchors = buildAnchors(d("2026-01-01"), [d("2026-03-10"), d("2026-03-10")]);
  assert.deepEqual(anchors.map(isoOf), ["2026-01-01", "2026-03-10"]);
});

test("a completion on the start date does not double the origin", () => {
  const anchors = buildAnchors(d("2026-01-01"), [d("2026-01-01"), d("2026-04-01")]);
  assert.deepEqual(anchors.map(isoOf), ["2026-01-01", "2026-04-01"]);
});

test("with no evidence at all the record has exactly one anchor, its start date", () => {
  assert.deepEqual(buildAnchors(d("2022-05-01"), []).map(isoOf), ["2022-05-01"]);
});

test("every anchor after the first is a completion, so only evidence can close a cycle", () => {
  const start = d("2026-03-01");
  const comps = [d("2026-01-15"), d("2026-05-02"), d("2026-05-02"), d("2026-06-20")];
  assert.deepEqual(buildAnchors(start, comps).map(isoOf), [
    "2026-01-15",
    "2026-05-02",
    "2026-06-20",
  ]);
});
