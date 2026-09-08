import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSupervisionNumber, type SlotLike } from "./next-supervision.ts";

const none: SlotLike[] = [
  { n: 1, comp: null },
  { n: 2, comp: null },
  { n: 3, comp: null },
];

test("with nothing completed, the next one is the first", () => {
  assert.equal(nextSupervisionNumber(none), 1);
});

test("the next one is the first without a completion", () => {
  assert.equal(
    nextSupervisionNumber([
      { n: 1, comp: "2026-01-05" },
      { n: 2, comp: null },
      { n: 3, comp: null },
    ]),
    2,
  );
});

test("a gap is respected: the first uncompleted slot wins, not the last completed plus one", () => {
  /* Slot 1 was skipped and slot 2 was completed. The next one to do is still 1. */
  assert.equal(
    nextSupervisionNumber([
      { n: 1, comp: null },
      { n: 2, comp: "2026-03-01" },
      { n: 3, comp: null },
    ]),
    1,
  );
});

test("all completed means there is no next one", () => {
  assert.equal(
    nextSupervisionNumber([
      { n: 1, comp: "2026-01-05" },
      { n: 2, comp: "2026-04-05" },
      { n: 3, comp: "2026-07-05" },
    ]),
    null,
  );
});

test("a four supervision cycle works the same way", () => {
  assert.equal(
    nextSupervisionNumber([
      { n: 1, comp: "2026-01-05" },
      { n: 2, comp: "2026-04-05" },
      { n: 3, comp: "2026-07-05" },
      { n: 4, comp: null },
    ]),
    4,
  );
});

test("no slots at all means there is no next one", () => {
  assert.equal(nextSupervisionNumber([]), null);
});

test("an empty completion string counts as not completed", () => {
  assert.equal(nextSupervisionNumber([{ n: 1, comp: "" }, { n: 2, comp: null }]), 1);
});
