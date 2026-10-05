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

test("due bands are separate (0 to 7, 8 to 14, 15 to 30), include today, and count checks", () => {
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
  assert.deepEqual([p.d7.total, p.d14.total, p.d30.total], [2, 2, 1]);
  assert.deepEqual(p.d7.lines.map((l) => l.detail), ["A", "B"]);
  assert.deepEqual(p.d14.lines.map((l) => l.detail), ["C", "D"]);
  assert.deepEqual(p.d30.lines.map((l) => l.detail), ["E"]);
});

test("only the first 8 are listed, soonest first, and the total stays whole", () => {
  const rows = Array.from({ length: 12 }, (_, i) =>
    row({ recordId: `p${i}`, name: `P${String(i).padStart(2, "0")}`, dueDate: addDaysIso(T, i < 6 ? 7 : 1) }),
  );
  const p = buildDuePreview(rows, T);
  assert.equal(p.d7.total, 12);
  assert.equal(p.d7.lines.length, 8);
  assert.equal(p.d7.lines[0].name, "P06"); // due tomorrow, so before the ones due in 7 days
});

test("labels read as a manager would say them, across a month end", () => {
  assert.equal(dueLabel("2026-09-28", T), "Today");
  assert.equal(dueLabel("2026-09-29", T), "Tomorrow");
  assert.equal(dueLabel("2026-10-03", T), "Due 03/10/2026");
  assert.equal(lateLabel("2026-08-31", T), "28 days late");
  assert.equal(addDaysIso("2028-02-28", 1), "2028-02-29");
});

test("a DBS never recorded, red from a start date of today, counts once: overdue, not also due today (W1)", () => {
  const p = buildDuePreview(
    [{ kind: "person", recordId: "a", name: "New Starter", checkName: "DBS not recorded", dueDate: "2026-10-03", rag: "red" }],
    "2026-10-03",
  );
  assert.equal(p.overdue.total, 1);
  assert.equal(p.overdue.people, 1);
  assert.equal(p.d7.total, 0);
});

test("dueBandRows: each report band matches its tile exactly", async () => {
  const { dueBandRows, buildDuePreview } = await import("./due-preview.ts");
  const today = "2026-10-05";
  const r = (name: string, checkName: string, dueDate: string, rag: string, kind: "person" | "service_user" = "person") =>
    ({ kind, recordId: name, name, checkName, dueDate, rag, branchId: "b" });
  const rows = [
    r("Ann", "Supervision", "2026-09-01", "red"),
    r("Ann", "Spot check", "2026-09-20", "red"),
    r("Bob", "Review", "2026-10-05", "amber", "service_user"),
    r("Cat", "Audit", "2026-10-12", "amber"),
    r("Dan", "Review", "2026-10-13", "green", "service_user"),
    r("Eve", "DBS", "2026-10-19", "green"),
    r("Fay", "Audit", "2026-10-20", "green"),
    r("Gus", "Audit", "2026-11-04", "green"),
    r("Hal", "Audit", "2026-11-05", "green"),
    r("Ivy", "Right to Work not recorded", "2026-10-05", "red"),
  ];
  const p = buildDuePreview(rows, today);
  const o = dueBandRows(rows, today, "overdue");
  assert.deepEqual(o.map((x) => x.name + x.checkName), ["AnnSupervision", "AnnSpot check", "IvyRight to Work not recorded"]);
  assert.equal(new Set(o.map((x) => x.recordId)).size, p.overdue.total); // tile counts records
  assert.deepEqual(dueBandRows(rows, today, "d7").map((x) => x.name), ["Bob", "Cat"]);
  assert.deepEqual(dueBandRows(rows, today, "d14").map((x) => x.name), ["Dan", "Eve"]);
  assert.deepEqual(dueBandRows(rows, today, "d30").map((x) => x.name), ["Fay", "Gus"]);
  assert.equal(dueBandRows(rows, today, "d7").length, p.d7.total);
  assert.equal(dueBandRows(rows, today, "d14").length, p.d14.total);
  assert.equal(dueBandRows(rows, today, "d30").length, p.d30.total);
});

test("TRAINING (2026-10-05): its own count on Overdue, separate from the same person's checks", () => {
  const p = buildDuePreview(
    [
      row({ checkName: "Supervision", dueDate: "2026-09-10", rag: "red" }),
      row({ kind: "training", checkName: "Fire Safety", dueDate: "2026-09-01", rag: "red" }),
      row({ kind: "training", checkName: "First Aid", dueDate: null, rag: "red" }),
      row({ kind: "training", recordId: "p2", name: "Bob Lee", checkName: "Moving and Handling", dueDate: null, rag: "red" }),
    ],
    T,
  );
  assert.equal(p.overdue.people, 1);
  assert.equal(p.overdue.serviceUsers, 0);
  assert.equal(p.overdue.training, 2);
  assert.equal(p.overdue.total, 3, "the three figures on the tile add up to its number");
  const jane = p.overdue.lines.find((l) => l.key === "training:p1");
  assert.equal(jane?.detail, "Training: Fire Safety, First Aid");
  assert.equal(jane?.when, "27 days late");
  assert.equal(jane?.href, "/people/training?person=p1");
  const bob = p.overdue.lines.find((l) => l.key === "training:p2");
  assert.equal(bob?.when, "Not done", "never done has no date to be late from");
});

test("TRAINING: a renewal lands in exactly one band and says it is training", () => {
  const rows = [
    row({ kind: "training", checkName: "Fire Safety", dueDate: addDaysIso(T, 3), rag: "amber" }),
    row({ kind: "training", checkName: "First Aid", dueDate: addDaysIso(T, 10), rag: "green" }),
    row({ kind: "training", checkName: "Infection Control", dueDate: addDaysIso(T, 25), rag: "green" }),
    row({ kind: "training", checkName: "Dementia", dueDate: addDaysIso(T, 45), rag: "green" }),
  ];
  const p = buildDuePreview(rows, T);
  assert.equal(p.d7.total, 1);
  assert.equal(p.d7.lines[0].detail, "Training: Fire Safety");
  assert.equal(p.d14.total, 1);
  assert.equal(p.d30.total, 1);
  assert.equal(p.overdue.total, 0);
});
