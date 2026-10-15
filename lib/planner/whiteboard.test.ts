import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OTHER,
  OVERDUE_BLOCK,
  headingFor,
  onToBookStrip,
  toBookPlacement,
  whiteboardLines,
  type WhiteboardVisit,
} from "./whiteboard.ts";
import { visitLabel } from "./visit.ts";

function visit(over: Partial<WhiteboardVisit> & { id: string }): WhiteboardVisit {
  const tasks = over.tasks ?? [];
  return {
    population: "people",
    subjectName: "Test Person",
    title: null,
    label: visitLabel(over.title ?? null, tasks.map((t) => t.label)),
    status: "planned",
    scheduledDate: "2026-10-20",
    startTime: "09:00",
    dueDate: null,
    conductorId: "u1",
    conductorName: "Manager",
    branchId: "b1",
    ...over,
    tasks,
  };
}
const task = (checkKey: string | null, label: string, dueDate: string | null = null, status: "planned" | "completed" | "cancelled" = "planned") =>
  ({ checkKey, label, status, dueDate });

/* The same set of bookings the Planner shows, of every kind that used to go missing. */
const bookings: WhiteboardVisit[] = [
  visit({ id: "single", tasks: [task("spot_check", "Spot Check", "2026-10-22")] }),
  visit({ id: "two", scheduledDate: "2026-10-24", tasks: [task("competency", "Medication Competency"), task("manual_handling", "Manual Handling")] }),
  visit({ id: "titled", title: "Home visit", tasks: [task("supervision", "Supervision", "2026-10-25")] }),
  visit({ id: "adhoc", title: "Collect uniform", tasks: [] }),
  visit({ id: "tracker", tasks: [task(null, "Probation Review")] }),
  visit({ id: "one2one", tasks: [task("one_to_one", "One to One")] }),
  visit({ id: "audit", tasks: [task("audit", "Audit", "2026-10-30")] }),
  visit({ id: "ltl-dated", tasks: [task("lead_the_leader", "Lead the Leader", "2026-10-28")] }),
  visit({ id: "ltl-adhoc", tasks: [task("lead_the_leader", "Lead the Leader")] }),
  visit({ id: "past", scheduledDate: "2026-09-01", tasks: [task("spot_check", "Spot Check", "2026-08-30")] }),
  visit({ id: "half-done", tasks: [task("spot_check", "Spot Check", "2026-10-20", "completed"), task("manual_handling", "Manual Handling", "2026-10-21")] }),
  visit({ id: "su", population: "service_users", tasks: [task("care_plan_review", "Care Plan Review", "2026-10-25")] }),
  visit({ id: "su-other", population: "service_users", tasks: [task("platform_audit", "Platform Audit", "2026-10-25")] }),
  visit({ id: "meeting", label: "Stage 2 hearing", source: "absence_meeting", href: "/people/absence", tasks: [] }),
  visit({ id: "done", status: "completed", tasks: [task("spot_check", "Spot Check", "2026-10-01", "completed")] }),
  visit({ id: "cancelled", status: "cancelled", tasks: [task("spot_check", "Spot Check", "2026-10-01", "cancelled")] }),
];

test("every booking planned on the Planner is on the Whiteboard", () => {
  const plannerList = bookings.filter((b) => b.status === "planned").map((b) => b.id);
  const lines = whiteboardLines(bookings);
  const onBoard = new Set(lines.map((l) => l.bookingId));
  for (const id of plannerList) assert.ok(onBoard.has(id), `${id} is on the Planner but not the Whiteboard`);
  assert.ok(!onBoard.has("done") && !onBoard.has("cancelled"), "only planned bookings are drawn");
});

test("a two task visit is one line under each task's heading", () => {
  const lines = whiteboardLines(bookings).filter((l) => l.bookingId === "two");
  assert.deepEqual(lines.map((l) => l.heading).sort(), ["competency", "manual_handling"]);
  assert.ok(lines.every((l) => l.taskCount === 2 && l.date === "2026-10-24"));
});

test("a custom title stays under its task's heading, and an ad hoc job goes under Other", () => {
  const lines = whiteboardLines(bookings);
  assert.equal(lines.find((l) => l.bookingId === "titled")?.heading, "supervision");
  const adhoc = lines.find((l) => l.bookingId === "adhoc");
  assert.equal(adhoc?.heading, OTHER);
  assert.equal(adhoc?.what, "Collect uniform");
});

test("checks with no heading, tracker forms and meetings go under Other on their side", () => {
  const lines = whiteboardLines(bookings);
  const at = (id: string) => lines.find((l) => l.bookingId === id)!;
  for (const id of ["tracker", "one2one", "audit", "ltl-adhoc", "meeting"]) assert.equal(at(id).heading, OTHER, id);
  assert.equal(at("one2one").what, "One to One");
  assert.equal(at("tracker").what, "Probation Review");
  assert.equal(at("meeting").what, "Stage 2 hearing");
  assert.equal(at("meeting").cancellable, false);
  assert.equal(at("su-other").population, "service_users");
  assert.equal(at("su-other").heading, OTHER);
  assert.equal(at("su").heading, "care_plan_review");
});

test("a dated Lead the Leader sits under Supervision", () => {
  assert.equal(whiteboardLines(bookings).find((l) => l.bookingId === "ltl-dated")?.heading, "supervision");
});

test("a past dated booking still planned is drawn; a task already done on a planned visit is not", () => {
  const lines = whiteboardLines(bookings);
  assert.ok(lines.some((l) => l.bookingId === "past"));
  const half = lines.filter((l) => l.bookingId === "half-done");
  assert.deepEqual(half.map((l) => l.heading), ["manual_handling"]);
});

test("headings are matched by key, never by name", () => {
  assert.equal(headingFor("people", "spot_check", null), "spot_check");
  assert.equal(headingFor("people", "Spot Check", null), OTHER);
  assert.equal(headingFor("service_users", "setup", null), "setup");
  assert.equal(headingFor("service_users", "spot_check", null), OTHER);
  assert.equal(headingFor("people", null, null), OTHER);
  assert.equal(onToBookStrip("people", "lead_the_leader"), true);
  assert.equal(onToBookStrip("people", "one_to_one"), false);
  assert.equal(onToBookStrip("service_users", "care_plan_review"), true);
});

const place = (dueDate: string | null, todayIso: string, extra: Partial<Parameters<typeof toBookPlacement>[0]> = {}) =>
  toBookPlacement({ dueDate, resumeDueDate: null, recurring: true, lastCompletedOn: null, todayIso, ...extra });

test("overdue from earlier weeks stays, in the Overdue block", () => {
  // Thursday 15 Oct 2026: this week is 12 to 18 Oct.
  assert.deepEqual(place("2024-10-01", "2026-10-15"), { due: "2024-10-01", block: OVERDUE_BLOCK });
  assert.deepEqual(place("2026-10-11", "2026-10-15"), { due: "2026-10-11", block: OVERDUE_BLOCK });
  // Earlier this week stays in this week, as before.
  assert.deepEqual(place("2026-10-12", "2026-10-15"), { due: "2026-10-12", block: 0 });
  assert.deepEqual(place("2026-11-08", "2026-10-15"), { due: "2026-11-08", block: 3 });
  assert.equal(place("2026-11-09", "2026-10-15"), null);
});

test("a Monday rollover moves last week's into Overdue rather than off the strip", () => {
  assert.equal(place("2026-10-18", "2026-10-18")?.block, 0); // Sunday: still this week
  assert.equal(place("2026-10-18", "2026-10-19")?.block, OVERDUE_BLOCK); // Monday: last week's, overdue
  assert.equal(place("2026-11-15", "2026-10-19")?.block, 3); // the new fourth week
});

test("month end and year end", () => {
  // Saturday 31 Oct 2026: this week is 26 Oct to 1 Nov.
  assert.equal(place("2026-11-01", "2026-10-31")?.block, 0);
  assert.equal(place("2026-11-02", "2026-10-31")?.block, 1);
  assert.equal(place("2026-10-25", "2026-10-31")?.block, OVERDUE_BLOCK);
  // Thursday 31 Dec 2026: this week is 28 Dec to 3 Jan.
  assert.equal(place("2027-01-03", "2026-12-31")?.block, 0);
  assert.equal(place("2027-01-24", "2026-12-31")?.block, 3);
});

test("a resumed service user is filtered and placed on the same date", () => {
  // Due before the span, resumed into it: on the strip, in the resumed week, not overdue.
  assert.deepEqual(place("2026-09-01", "2026-10-15", { resumeDueDate: "2026-10-20" }), { due: "2026-10-20", block: 1 });
  // Due inside the span, resumed beyond it: not on the strip yet.
  assert.equal(place("2026-10-14", "2026-10-15", { resumeDueDate: "2026-11-20" }), null);
  // A resume date earlier than the due date changes nothing.
  assert.deepEqual(place("2026-10-20", "2026-10-15", { resumeDueDate: "2026-10-01" }), { due: "2026-10-20", block: 1 });
});

test("done is never outstanding: a one off already done, or a completion that met the date", () => {
  assert.equal(place("2024-06-10", "2026-10-15", { recurring: false, lastCompletedOn: "2024-06-10" }), null);
  assert.equal(place("2026-10-14", "2026-10-15", { recurring: false, lastCompletedOn: "2026-10-16" }), null);
  assert.equal(place("2026-07-03", "2026-10-15", { recurring: true, lastCompletedOn: "2026-07-03" }), null);
  assert.equal(place("2026-09-21", "2026-10-15", { recurring: false, lastCompletedOn: null })?.block, OVERDUE_BLOCK);
  assert.equal(place(null, "2026-10-15"), null);
});
