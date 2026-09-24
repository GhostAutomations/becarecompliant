import { test } from "node:test";
import assert from "node:assert/strict";
import { rtwAbsenceDates, rtwDueLabel, rtwFromSearch, rtwHref, sortRtwForDashboard } from "./rtw-list.ts";

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
