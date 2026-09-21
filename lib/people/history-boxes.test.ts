import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRACKER_BOXES,
  historyBoxes,
  historyEntries,
  trackerPatch,
  type DefLite,
} from "./history-boxes.ts";

const DEFS: DefLite[] = [
  { id: "sup", key: "supervision", name: "Supervision", recurring: true },
  { id: "app", key: "appraisal", name: "Annual Appraisal", recurring: true },
  { id: "spot", key: "spot_check", name: "Spot Check", recurring: true },
  { id: "med", key: "competency", name: "Medication Competency", recurring: true },
  { id: "mh", key: "manual_handling", name: "Manual Handling", recurring: true },
  { id: "aud", key: "audit", name: "Audit", recurring: true },
  { id: "men", key: "mentoring", name: "Mentoring", recurring: false },
];

test("the boxes are the matrix columns, in matrix order", () => {
  const names = historyBoxes(DEFS).map((b) => b.label);
  assert.deepEqual(names, [
    "Manual Handling",
    "Medication Competency",
    "Recent Spot Check",
    "Supervision 1 Done",
    "Supervision 2 Done",
    "Supervision 3 Done",
    "Annual Appraisal Done",
    "Audit",
  ]);
});

test("a company that renamed its columns sees its own names", () => {
  const boxes = historyBoxes(DEFS, { recent_spot_check: "Last Observation", audit: "Staff File Audit" });
  const labels = boxes.map((b) => b.label);
  assert.ok(labels.includes("Last Observation"));
  assert.ok(labels.includes("Staff File Audit"));
});

test("four supervisions instead of three and an appraisal", () => {
  const labels = historyBoxes(DEFS, {}, "four_supervisions").map((b) => b.label);
  assert.ok(labels.includes("Supervision 4 Done"));
  assert.equal(labels.includes("Annual Appraisal Done"), false);
});

test("a one-off check gets no box: there is no cycle to restart and no column to show it", () => {
  assert.equal(historyBoxes(DEFS).some((b) => b.definitionId === "men"), false);
});

test("a company's own recurring check is asked for under its own name", () => {
  const boxes = historyBoxes([...DEFS, { id: "fire", key: "fire_drill", name: "Fire Drill", recurring: true }]);
  assert.equal(boxes.at(-1)?.label, "Fire Drill");
});

test("supervisions are stored slot by slot, newest completion first", () => {
  const boxes = historyBoxes(DEFS);
  const entries = historyEntries(
    boxes,
    {
      done_sup_1: "2026-01-10",
      done_sup_2: "2026-04-02",
      done_sup_3: "2026-06-21",
      done_spot: "2026-08-30",
    },
    DEFS,
  );
  const sup = entries.find((e) => e.definitionId === "sup")!;
  assert.deepEqual(sup.dates, ["2026-06-21", "2026-04-02", "2026-01-10"]);
  assert.deepEqual(sup.slots, [3, 2, 1]);
  const spot = entries.find((e) => e.definitionId === "spot")!;
  assert.deepEqual(spot.dates, ["2026-08-30"]);
  assert.deepEqual(spot.slots, [null]);
});

test("a blank box means never done, so nothing is recorded for it", () => {
  const boxes = historyBoxes(DEFS);
  const entries = historyEntries(boxes, { done_sup_1: "2026-01-10", done_med: "   " }, DEFS);
  assert.deepEqual(entries.map((e) => e.definitionId), ["sup"]);
});

test("anything that is not a date is dropped rather than guessed at", () => {
  const boxes = historyBoxes(DEFS);
  assert.deepEqual(historyEntries(boxes, { done_spot: "last tuesday" }, DEFS), []);
});

test("only the tracker boxes that were filled in are written", () => {
  assert.deepEqual(
    trackerPatch({
      t_dbs_date: "2025-03-04",
      t_rtw_limits: "20hrs_term",
      t_probation_status: "passed",
      t_enhanced_dbs_date: "",
      t_probation_end_due: "not a date",
    }),
    { dbs_date: "2025-03-04", rtw_limits: "20hrs_term", probation_status: "passed" },
  );
});

test("every document box says which date it wants", () => {
  for (const b of TRACKER_BOXES) {
    assert.ok(b.hint.length > 10, `${b.name} has no hint`);
  }
  // The three date kinds are named in the words a manager would use, not ours.
  const byName = Object.fromEntries(TRACKER_BOXES.map((b) => [b.name, b.hint]));
  assert.match(byName.t_dbs_date, /^Completion date/);
  /* Enhanced DBS is the RENEWAL DEADLINE, not a second certificate date: that is how the board
     it came from uses it, and how all fourteen of Thistle's carers are stored. */
  assert.match(byName.t_enhanced_dbs_date, /^Expiry date/);
  assert.match(byName.t_rtw_expiry_date, /^Expiry date/);
  assert.match(byName.t_probation_end_due, /^Due date/);
  assert.match(byName.t_probation_end_actual, /^Completion date/);
  assert.match(byName.t_probation_extension_date, /^Expiry date/);
});

test("every tracker box names a column to write to", () => {
  const patch = trackerPatch(
    Object.fromEntries(
      TRACKER_BOXES.map((b) => [b.name, b.kind === "date" ? "2026-01-01" : "passed"]),
    ),
  );
  assert.equal(Object.keys(patch).length, TRACKER_BOXES.length);
});
