import { test } from "node:test";
import assert from "node:assert/strict";
import { STARTER_TASKS, TASK_REASONS, cleanTaskList, keyTasksWithoutOutcome, mergeOutcomes, outcomeProblem, taskReasonLabel, taskSummary, type TaskEvent } from "./tasks.ts";

test("the starter list is Phil's seven groups, with no medicines and no repeats", () => {
  assert.deepEqual(STARTER_TASKS.map((g) => g.category), [
    "Personal care",
    "Food and drink",
    "Moving around",
    "Health and wellbeing",
    "Home and safety",
    "Out and about",
    "Evening and night",
  ]);
  const all = STARTER_TASKS.flatMap((g) => g.tasks.map((t) => t.toLowerCase()));
  assert.equal(new Set(all).size, all.length);
  assert.ok(!all.some((t) => /medic|tablet|cream|dose/.test(t)));
  // no dashes as punctuation in customer copy
  assert.ok(!STARTER_TASKS.flatMap((g) => g.tasks).some((t) => /\s[-–—]\s/.test(t)));
});

test("the reasons are the fifteen the database accepts, ending with Other", () => {
  assert.deepEqual(TASK_REASONS.map((r) => r.code), [
    "declined", "asleep", "unwell", "not_home", "in_hospital", "away", "done_earlier", "done_by_family",
    "done_by_professional", "not_needed_today", "no_supplies", "equipment", "unsafe", "no_time", "other",
  ]);
  assert.equal(taskReasonLabel("declined"), "Service user declined");
  assert.equal(taskReasonLabel("other", "Road flooded"), "Road flooded");
  assert.equal(taskReasonLabel(null), null);
});

test("a list as the office edits it: trimmed, no blanks or repeats, at most 40", () => {
  const out = cleanTaskList([
    { name: "  Prepare   lunch ", category: "Food and drink", key: false },
    { name: "prepare lunch", category: "Food and drink", key: true },
    { name: "   ", category: "Custom", key: false },
    { name: "Prompt fluids", category: "", key: true },
  ]);
  assert.deepEqual(out, [
    { name: "Prepare lunch", category: "Food and drink", key: false },
    { name: "Prompt fluids", category: "Custom", key: true },
  ]);
  assert.equal(cleanTaskList(Array.from({ length: 50 }, (_, i) => ({ name: `Task ${i}`, category: "Custom", key: false }))).length, 40);
});

test("clock out asks only for key tasks with no outcome; any outcome counts", () => {
  const tasks = [
    { uid: "a", name: "Prepare lunch", category: "Food and drink", key: false },
    { uid: "b", name: "Prompt fluids", category: "Food and drink", key: true },
    { uid: "c", name: "Check the home is safe on leaving", category: "Home and safety", key: true },
  ];
  assert.deepEqual(keyTasksWithoutOutcome(tasks, {}).map((t) => t.uid), ["b", "c"]);
  const refused = { outcome: "refused" as const, reason_code: "declined", reason_text: null, at: "x" };
  assert.deepEqual(keyTasksWithoutOutcome(tasks, { b: refused }).map((t) => t.uid), ["c"]);
});

test("a task not done needs a reason, and Other needs it typed", () => {
  assert.equal(outcomeProblem("done", null, ""), null);
  assert.equal(outcomeProblem("refused", null, ""), "Pick a reason.");
  assert.equal(outcomeProblem("not_needed", "other", "  "), "Type the reason.");
  assert.equal(outcomeProblem("not_needed", "other", "Family took her out"), null);
});

test("the office's summary counts outcomes and unmarked key tasks", () => {
  const tasks = [
    { uid: "a", name: "A", category: "Custom", key: false },
    { uid: "b", name: "B", category: "Custom", key: true },
    { uid: "c", name: "C", category: "Custom", key: true },
    { uid: "d", name: "D", category: "Custom", key: false },
  ];
  const s = taskSummary(tasks, {
    a: { outcome: "done", reason_code: null, reason_text: null, at: "x" },
    b: { outcome: "refused", reason_code: "declined", reason_text: null, at: "x" },
    d: { outcome: "not_needed", reason_code: "done_earlier", reason_text: null, at: "x" },
  });
  assert.equal(s.text, "1 of 4 done · 1 refused · 1 not needed · 1 key task not marked");
  assert.equal(s.keyMissing, 1);
});

test("what the carer sees: a newer outcome waiting on the phone wins over the server's, never someone else's", () => {
  const server = { a: { outcome: "done" as const, reason_code: null, reason_text: null, at: "2026-10-16T12:05:00.000Z" } };
  const ev = (over: Partial<TaskEvent>): TaskEvent => ({
    event_id: "e", owner: "me", visit_id: "v1", list_id: "l1", task_uid: "a", outcome: "refused", reason_code: "declined",
    reason_text: null, phone_time: "2026-10-16T12:10:00.000Z", ...over,
  });
  assert.equal(mergeOutcomes(server, [ev({})], "v1", "me").a.outcome, "refused");
  assert.equal(mergeOutcomes(server, [ev({})], "v1", "me").a.waiting, true);
  // older than the server's: the server's stands
  assert.equal(mergeOutcomes(server, [ev({ phone_time: "2026-10-16T12:00:00.000Z" })], "v1", "me").a.outcome, "done");
  // another visit, another sign in, or a refused tap: ignored
  assert.equal(mergeOutcomes(server, [ev({ visit_id: "v2" })], "v1", "me").a.outcome, "done");
  assert.equal(mergeOutcomes(server, [ev({ owner: "someone else" })], "v1", "me").a.outcome, "done");
  assert.equal(mergeOutcomes(server, [ev({ refused: "Not yours" })], "v1", "me").a.outcome, "done");
  // the server's time written as +00:00 still compares as a time
  const serverPlus = { a: { outcome: "done" as const, reason_code: null, reason_text: null, at: "2026-10-16T12:05:00.123+00:00" } };
  assert.equal(mergeOutcomes(serverPlus, [ev({ phone_time: "2026-10-16T12:04:00.000Z" })], "v1", "me").a.outcome, "done");
  assert.equal(mergeOutcomes(serverPlus, [ev({ phone_time: "2026-10-16T12:06:00.000Z" })], "v1", "me").a.outcome, "refused");
  // a task the server has nothing for yet
  assert.equal(mergeOutcomes({}, [ev({ task_uid: "b", outcome: "done", reason_code: null })], "v1", "me").b.outcome, "done");
});
