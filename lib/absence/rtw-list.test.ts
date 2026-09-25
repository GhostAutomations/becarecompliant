import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAwaitingLastDate,
  offSinceLabel,
  rtwAbsenceDates,
  rtwDueLabel,
  rtwFromSearch,
  rtwHref,
  sortRtwForDashboard,
  viewAbsenceHref,
  viewFromSearch,
} from "./rtw-list.ts";

test("overdue first, then soonest due", () => {
  const rows = [
    { absenceEventId: "a", startDate: "2026-09-10", endDate: null, dueDate: "2026-09-30", overdue: false },
    { absenceEventId: "b", startDate: "2026-08-20", endDate: null, dueDate: "2026-08-23", overdue: true },
    { absenceEventId: "c", startDate: "2026-09-12", endDate: null, dueDate: "2026-09-26", overdue: false },
    { absenceEventId: "d", startDate: "2026-08-03", endDate: null, dueDate: "2026-08-06", overdue: true },
  ];
  assert.deepEqual(sortRtwForDashboard(rows).map((r) => r.absenceEventId), ["d", "b", "c", "a"]);
  assert.equal(rows[0].absenceEventId, "a", "the input is not reordered");
});

test("dates and due labels read like the Absence page", () => {
  assert.equal(rtwAbsenceDates("2026-08-03", null), "03/08/2026");
  assert.equal(rtwAbsenceDates("2026-08-03", "2026-08-03"), "03/08/2026");
  assert.equal(rtwAbsenceDates("2026-08-03", "2026-08-05"), "03/08/2026 to 05/08/2026");
  assert.equal(rtwDueLabel({ dueDate: "2026-08-06", overdue: true }), "Overdue 06/08/2026");
  assert.equal(rtwDueLabel({ dueDate: "2026-09-30", overdue: false }), "Due 30/09/2026");
});

test("the link opens that Return to Work and nothing else", () => {
  const id = "3c94d891-aaea-4661-bdd9-756e242e33ae";
  assert.equal(rtwHref(id), `/people/absence?rtw=${id}`);
  assert.equal(rtwFromSearch(`?rtw=${id}`), id);
  assert.equal(rtwFromSearch("?rtw=not-an-id"), null);
  assert.equal(rtwFromSearch(""), null);
});

test("an absence waits for a last date from the day after it began, if recorded from 25/09", () => {
  const today = "2026-09-26";
  const base = { end_date: null, return_date: null, created_at: "2026-09-25T08:10:00Z" };
  assert.equal(isAwaitingLastDate({ ...base, start_date: "2026-09-25" }, today), true);
  assert.equal(isAwaitingLastDate({ ...base, start_date: "2026-09-26" }, today), false, "not on its first day");
  assert.equal(isAwaitingLastDate({ ...base, start_date: "2026-09-25", end_date: "2026-09-25" }, today), false);
  assert.equal(isAwaitingLastDate({ ...base, start_date: "2026-09-25", return_date: "2026-09-26" }, today), false);
  assert.equal(
    isAwaitingLastDate({ ...base, start_date: "2026-04-25", created_at: "2026-09-24T20:00:00Z" }, today),
    false,
    "history recorded before 25/09 stays quiet",
  );
  assert.equal(
    isAwaitingLastDate({ ...base, start_date: "2026-09-24", created_at: "2026-09-24T23:30:00Z" }, today),
    true,
    "00:30 on 25/09 London time counts",
  );
});

test("off since counts the first day, and the view link opens that person", () => {
  assert.equal(offSinceLabel("2026-09-25", "2026-09-26"), "Off since 25/09/2026 · 2 days");
  assert.equal(offSinceLabel("2026-09-26", "2026-09-26"), "Off since 26/09/2026 · 1 day");
  const id = "65546658-925a-495a-ab0a-cbdf4fa5e921";
  assert.equal(viewAbsenceHref(id), `/people/absence?view=${id}`);
  assert.equal(viewFromSearch(`?view=${id}`), id);
  assert.equal(viewFromSearch("?view=x"), null);
});
