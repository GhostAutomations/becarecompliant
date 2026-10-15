import { test } from "node:test";
import assert from "node:assert/strict";
import { callMinutes, callSlots, generatedKey, type ScheduleEntry } from "./calls.ts";

const e = (id: string, day: number, service: string, slot: string | null, position: number | null, unit = "30m", quantity: number | string | null = 1): ScheduleEntry => ({
  id, day_of_week: day, service, unit, quantity, slot, position, carers: 1,
});

test("call lengths from the Care Schedule's unit and quantity", () => {
  assert.equal(callMinutes("30m", 1), 30);
  assert.equal(callMinutes("15m", "3.00"), 45);
  assert.equal(callMinutes("1hr", 1.5), 90);
  assert.equal(callMinutes("12hr", 1), 720);
  assert.equal(callMinutes("Fixed", 1), null);
});

test("two calls of the same service and part of day are numbered 1 and 2 in schedule order", () => {
  const slots = callSlots([e("b", 0, "Care", "morning", 2), e("a", 0, "Care", "morning", 1), e("c", 0, "Sit", "morning", 3)]);
  assert.deepEqual(slots.map((s) => [s.entryId, s.occurrence]), [["a", 1], ["b", 2], ["c", 1]]);
});

test("visit generation is idempotent across a Care Schedule re-save (new row ids, same calls)", () => {
  const before = callSlots([e("old1", 1, "Care", "lunch", 1), e("old2", 1, "Care", "lunch", 2)]);
  const after = callSlots([e("new9", 1, "Care", "lunch", 2), e("new8", 1, "Care", "lunch", 1)]);
  const keys = (slots: ReturnType<typeof callSlots>) => slots.map((s) => generatedKey("su1", "2026-11-03", s)).sort();
  assert.deepEqual(keys(before), keys(after));
  // And making them twice gives the same set, so nothing is added the second time.
  assert.deepEqual(new Set(keys(before)).size, 2);
});

test("a call with no part of day is keyed with an empty slot, the database's coalesce(slot, '')", () => {
  const [s] = callSlots([e("x", 6, "Sleep", null, null, "Fixed")]);
  assert.equal(s.slotKey, "");
  assert.equal(s.minutes, null);
  assert.equal(generatedKey("su1", "2026-11-08", s), "su1:2026-11-08:Sleep::1");
});
