import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDuePreview, type DueRow, dueLabel, lateLabel, addDaysIso } from "./due-preview.ts";

const T = "2026-09-28";
const row = (p: Partial<DueRow>): DueRow => ({
  kind: "person",
  recordId: "p1",
  name: "Jane Smith",
  checkName: "Supervision",
  dueDate: T,
  rag: "amber",
  ...p,
});

test("overdue counts records, not checks, and lists every red check on one line", () => {
  const p = buildDuePreview(
    [
      row({ checkName: "Supervision", dueDate: "2026-09-10", rag: "red" }),
      row({ checkName: "DBS", dueDate: "2026-09-20", rag: "red" }),
      row({ recordId: "s1", kind: "service_user", name: "Ann Jones", checkName: "Care plan review", dueDate: "2026-09-27", rag: "red" }),
    ],
    T,
  );
  assert.equal(p.overdue.total, 2);
  assert.equal(p.overdue.people, 1);
  assert.equal(p.overdue.serviceUsers, 1);
  assert.equal(p.overdue.lines[0].name, "Jane Smith");
  assert.equal(p.overdue.lines[0].detail, "Supervision, DBS");
  assert.equal(p.overdue.lines[0].when, "18 days late");
  assert.equal(p.overdue.lines[0].href, "/people/p1");
  assert.equal(p.overdue.lines[1].when, "1 day late");
  assert.equal(p.overdue.lines[1].href, "/service-users/s1");
});

test("a finished one off with an old date but green rag is never overdue", () => {
  const p = buildDuePreview([row({ checkName: "Setup", dueDate: "2025-01-01", rag: "green" })], T);
  assert.equal(p.overdue.total, 0);
  assert.equal(p.d30.total, 0);
});

test("due windows are nested, include today, and count checks", () => {
  const p = buildDuePreview(
    [
      row({ checkName: "A", dueDate: T }),
      row({ checkName: "B", dueDate: addDaysIso(T, 7) }),
      row({ checkName: "C", dueDate: addDaysIso(T, 8) }),
      row({ checkName: "D", dueDate: addDaysIso(T, 14) }),
      row({ checkName: "E", dueDate: addDaysIso(T, 30) }),
      row({ checkName: "F", dueDate: addDaysIso(T, 31) }),
      row({ checkName: null, dueDate: addDaysIso(T, 3) }),
    ],
    T,
  );
  assert.deepEqual([p.d7.total, p.d14.total, p.d30.total], [2, 4, 5]);
  assert.deepEqual(p.d30.lines.map((l) => l.detail), ["A", "B", "C", "D", "E"]);
});

test("only the first 8 are listed, soonest first, and the total stays whole", () => {
  const rows = Array.from({ length: 12 }, (_, i) => row({ recordId: `p${i}`, name: `P${i}`, dueDate: addDaysIso(T, 12 - i) }));
  const p = buildDuePreview(rows, T);
  assert.equal(p.d30.total, 12);
  assert.equal(p.d30.lines.length, 8);
  assert.equal(p.d30.lines[0].name, "P11");
});

test("labels read as a manager would say them, across a month end", () => {
  assert.equal(dueLabel("2026-09-28", T), "Today");
  assert.equal(dueLabel("2026-09-29", T), "Tomorrow");
  assert.equal(dueLabel("2026-10-03", T), "Due 03/10/2026");
  assert.equal(lateLabel("2026-08-31", T), "28 days late");
  assert.equal(addDaysIso("2028-02-28", 1), "2028-02-29");
});
