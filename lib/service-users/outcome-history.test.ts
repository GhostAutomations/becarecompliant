import { test } from "node:test";
import assert from "node:assert/strict";
import {
  closeDateError,
  countsOn,
  enteredLaterLine,
  historicWindowOpen,
  londonDate,
  middayOf,
  outcomeFrom,
  outcomesPqs,
  pastOutcomeError,
  pastUpdateError,
  pastUpdateIsLatest,
  sortUpdates,
  statusAsAt,
  updateDate,
  type TimelineUpdate,
} from "./outcome-history.ts";

const TODAY = "2026-10-13";

const u = (kind: string, progress: string | null, created_at: string, dated_on: string | null = null): TimelineUpdate => ({
  kind,
  progress,
  created_at,
  dated_on,
});

test("dates are London dates, across the clock change", () => {
  // 23:30 UTC on 31 March is 00:30 BST on 1 April.
  assert.equal(londonDate("2026-03-31T23:30:00+00:00"), "2026-04-01");
  // 23:30 UTC in winter is the same day in London.
  assert.equal(londonDate("2026-01-31T23:30:00+00:00"), "2026-01-31");
  // Midday UTC is the same date in London in winter and summer.
  assert.equal(londonDate(middayOf("2026-07-01")), "2026-07-01");
  assert.equal(londonDate(middayOf("2026-12-31")), "2026-12-31");
  assert.equal(londonDate(middayOf("2028-02-29")), "2028-02-29");
});

test("an outcome begins on its From date, else the day it was added", () => {
  assert.equal(outcomeFrom({ start_date: "2026-04-01", created_at: "2026-10-13T09:00:00Z" }), "2026-04-01");
  assert.equal(outcomeFrom({ start_date: null, created_at: "2026-10-13T09:00:00Z" }), "2026-10-13");
  assert.equal(updateDate({ dated_on: "2026-05-02", created_at: "2026-10-13T09:00:00Z" }), "2026-05-02");
  assert.equal(updateDate({ dated_on: null, created_at: "2026-10-13T09:00:00Z" }), "2026-10-13");
});

test("updates sort by the day they speak for, then the order they were added", () => {
  const list = [
    u("progress", "progressing", "2026-10-13T09:00:00Z"),
    u("progress", "no_change", "2026-10-13T10:00:00Z", "2026-05-01"),
    u("progress", "regressing", "2026-10-13T11:00:00Z", "2026-05-01"),
    u("progress", "progressing", "2026-10-13T08:00:00Z", "2026-07-01"),
  ];
  assert.deepEqual(sortUpdates(list).map((x) => x.progress), ["no_change", "regressing", "progressing", "progressing"]);
  assert.equal(sortUpdates(list)[3].dated_on, null);
});

test("the window is open up to and including its last day", () => {
  assert.equal(historicWindowOpen("2026-10-27", "2026-10-27"), true);
  assert.equal(historicWindowOpen("2026-10-27", "2026-10-28"), false);
  assert.equal(historicWindowOpen(null, TODAY), false);
  assert.equal(historicWindowOpen("not a date", TODAY), false);
});

test("an entered later line says when, who and the date it speaks for", () => {
  assert.equal(
    enteredLaterLine("2026-10-13T15:00:00Z", "Bev Admin", "2026-04-01"),
    "Added on 13/10/2026 by Bev Admin, dated 01/04/2026",
  );
  assert.equal(enteredLaterLine("2026-10-13T15:00:00Z", null, "2026-04-01"), "Added on 13/10/2026, dated 01/04/2026");
});

test("a past outcome: From not in the future, To not before From, within the stay", () => {
  const base = { todayIso: TODAY, dischargeDate: null };
  assert.equal(pastOutcomeError({ ...base, from: "2026-04-01", to: "2026-09-30" }), null);
  assert.equal(pastOutcomeError({ ...base, from: "2026-04-01", to: null }), null);
  // To is the target date, so it may still be ahead.
  assert.equal(pastOutcomeError({ ...base, from: "2026-04-01", to: "2027-01-31" }), null);
  assert.equal(pastOutcomeError({ ...base, from: TODAY, to: TODAY }), null);
  assert.match(pastOutcomeError({ ...base, from: "2026-10-14", to: null }) ?? "", /future/);
  assert.match(pastOutcomeError({ ...base, from: "2026-04-01", to: "2026-03-31" }) ?? "", /before the From/);
  assert.match(pastOutcomeError({ ...base, from: "", to: null }) ?? "", /From/);
  assert.match(pastOutcomeError({ ...base, from: "2026-02-30", to: null }) ?? "", /From/);
  assert.match(
    pastOutcomeError({ todayIso: TODAY, dischargeDate: "2026-06-30", from: "2026-07-01", to: null }) ?? "",
    /discharged on 30\/06\/2026/,
  );
});

test("a past update: not in the future, not before the outcome began, not after it was achieved", () => {
  const base = {
    todayIso: TODAY,
    outcomeFromIso: "2026-04-01",
    achievedOn: null,
    dischargeDate: null,
    marksAchieved: false,
    existing: [] as TimelineUpdate[],
  };
  assert.equal(pastUpdateError({ ...base, date: "2026-04-01" }), null);
  assert.equal(pastUpdateError({ ...base, date: TODAY }), null);
  assert.match(pastUpdateError({ ...base, date: "2026-10-14" }) ?? "", /future/);
  assert.match(pastUpdateError({ ...base, date: "2026-03-31" }) ?? "", /before the outcome began \(01\/04\/2026\)/);
  assert.match(pastUpdateError({ ...base, date: "2026-07-01", dischargeDate: "2026-06-30" }) ?? "", /discharged/);
  assert.equal(pastUpdateError({ ...base, date: "2026-06-01", achievedOn: "2026-06-01" }), null);
  assert.match(pastUpdateError({ ...base, date: "2026-06-02", achievedOn: "2026-06-01" }) ?? "", /achieved on 01\/06\/2026/);
  assert.match(pastUpdateError({ ...base, date: "2026-05-01", achievedOn: "2026-06-01", marksAchieved: true }) ?? "", /already achieved/);
  // Achieved in the past must not sit before a later update.
  const existing = [u("progress", "progressing", "2026-10-13T09:00:00Z", "2026-08-01")];
  assert.match(pastUpdateError({ ...base, date: "2026-07-01", marksAchieved: true, existing }) ?? "", /dated 01\/08\/2026/);
  assert.equal(pastUpdateError({ ...base, date: "2026-08-01", marksAchieved: true, existing }), null);
});

test("a past update sets the status only when it is the latest", () => {
  const existing = [
    u("progress", "progressing", "2026-10-01T09:00:00Z"),
    u("progress", "no_change", "2026-10-13T09:00:00Z", "2026-06-01"),
  ];
  assert.equal(pastUpdateIsLatest(existing, "2026-09-30", false), false);
  assert.equal(pastUpdateIsLatest(existing, "2026-10-01", false), true); // the same day: the new one was added last
  assert.equal(pastUpdateIsLatest([], "2026-04-01", false), true);
  assert.equal(pastUpdateIsLatest([], "2026-04-01", true), false); // an achieved outcome stays achieved
});

test("status as at a day: today is untouched, the past reads the timeline", () => {
  const o = { status: "progressing" as const, start_date: "2026-04-01", created_at: "2026-10-13T09:00:00Z" };
  const ups = [
    u("progress", "regressing", "2026-10-13T09:01:00Z", "2026-05-15"),
    u("progress", "no_change", "2026-10-13T09:02:00Z", "2026-07-15"),
    u("progress", "progressing", "2026-10-13T09:03:00Z", "2026-09-15"),
  ];
  assert.equal(statusAsAt(o, ups, "2026-03-31", TODAY), null); // not begun
  assert.equal(statusAsAt(o, ups, "2026-04-30", TODAY), "working_towards");
  assert.equal(statusAsAt(o, ups, "2026-05-31", TODAY), "regressing");
  assert.equal(statusAsAt(o, ups, "2026-08-31", TODAY), "no_change");
  assert.equal(statusAsAt(o, ups, "2026-09-30", TODAY), "progressing");
  // Today and later: the status it carries now, whatever the timeline says.
  assert.equal(statusAsAt({ ...o, status: "no_change" }, ups, TODAY, TODAY), "no_change");
  // Achieved, then reopened.
  const ach = [u("completed", null, "2026-10-13T09:00:00Z", "2026-06-01"), u("reopened", null, "2026-10-13T09:05:00Z", "2026-08-01")];
  assert.equal(statusAsAt(o, ach, "2026-06-30", TODAY), "achieved");
  assert.equal(statusAsAt(o, ach, "2026-08-31", TODAY), "working_towards");
  // An older outcome with no updates keeps the status it carries.
  const legacy = { status: "achieved" as const, start_date: null, created_at: "2025-01-10T09:00:00Z" };
  assert.equal(statusAsAt(legacy, [], "2026-03-31", TODAY), "achieved");
  // Added today with no From: it had not begun in any past period.
  const fresh = { status: "progressing" as const, start_date: null, created_at: "2026-10-13T09:00:00Z" };
  assert.equal(statusAsAt(fresh, [], "2026-09-30", TODAY), null);
});

test("who counts on a day: receiving a service today; discharged only after that day; never a removed record", () => {
  const su = (service_status: string, discharge_date: string | null = null, archived_at: string | null = null) => ({
    service_status,
    discharge_date,
    archived_at,
  });
  assert.equal(countsOn(su("active"), TODAY, TODAY), true);
  // In hospital or on respite still counts (Phil, 2026-10-13).
  assert.equal(countsOn(su("hospital"), TODAY, TODAY), true);
  assert.equal(countsOn(su("respite"), "2026-07-31", TODAY), true);
  // A removed record never counts.
  assert.equal(countsOn(su("active", null, "2026-09-01T10:00:00Z"), TODAY, TODAY), false);
  assert.equal(countsOn(su("hospital", null, "2026-09-01T10:00:00Z"), "2026-07-31", TODAY), false);
  // Discharged: out today; in a past period that ended before the discharge (the discharge archives it).
  const left = su("cancelled", "2026-08-01", "2026-08-01T10:00:00Z");
  assert.equal(countsOn(left, TODAY, TODAY), false);
  assert.equal(countsOn(left, "2026-07-31", TODAY), true);
  assert.equal(countsOn(left, "2026-08-01", TODAY), false);
  assert.equal(countsOn(su("cancelled"), "2026-07-31", TODAY), false);
});

test("the outcomes PQS bands are the sheet's own, rounded down to two decimals", () => {
  assert.deepEqual(outcomesPqs(0, 0), { rate: null, band: null });
  assert.deepEqual(outcomesPqs(20, 20), { rate: 100, band: 10 });
  assert.deepEqual(outcomesPqs(17, 20), { rate: 85, band: 7 }); // 85.00 is the 7 band
  assert.deepEqual(outcomesPqs(8501, 10000), { rate: 85.01, band: 10 });
  assert.deepEqual(outcomesPqs(9, 10), { rate: 90, band: 10 });
  assert.deepEqual(outcomesPqs(7, 10), { rate: 70, band: 5 });
  assert.deepEqual(outcomesPqs(6, 10), { rate: 60, band: 5 });
  assert.deepEqual(outcomesPqs(5, 10), { rate: 50, band: 2 });
  assert.deepEqual(outcomesPqs(1, 3), { rate: 33.33, band: 2 });
  assert.deepEqual(outcomesPqs(2, 3), { rate: 66.66, band: 5 }); // 66.666 rounds down
  assert.deepEqual(outcomesPqs(1, 200), { rate: 0.5, band: 0 });
  assert.deepEqual(outcomesPqs(0, 10), { rate: 0, band: 0 });
});

// ---- Not achieved (Phil, 2026-10-14)

test("a not achieved update closes the outcome as not achieved; reopening brings it back", () => {
  const o = { status: "working_towards" as const, start_date: "2026-01-30", created_at: "2026-10-13T12:46:00Z" };
  const ups = [
    { kind: "progress", progress: "regressing", dated_on: "2026-05-01", created_at: "2026-10-13T12:47:00Z" },
    { kind: "not_achieved", progress: null, dated_on: "2026-07-07", created_at: "2026-10-13T12:48:00Z" },
  ];
  assert.equal(statusAsAt(o, ups, "2026-06-30", "2026-10-14"), "regressing");
  assert.equal(statusAsAt(o, ups, "2026-07-31", "2026-10-14"), "not_achieved");
  const reopened = [...ups, { kind: "reopened", progress: null, dated_on: null, created_at: "2026-10-14T09:00:00Z" }];
  assert.equal(statusAsAt(o, reopened, "2026-10-13", "2026-10-15"), "not_achieved");
  assert.equal(statusAsAt(o, reopened, "2026-10-14", "2026-10-15"), "working_towards");
});

test("the close date: not in the future, not before the outcome began, not before the latest update", () => {
  const base = { todayIso: "2026-10-14", outcomeFromIso: "2026-01-30", dischargeDate: null, existing: [] as never[] };
  assert.equal(closeDateError({ ...base, date: "" }), "Choose the date the outcome was closed.");
  assert.equal(closeDateError({ ...base, date: "2026-10-15" }), "The date it was closed cannot be in the future.");
  assert.equal(closeDateError({ ...base, date: "2026-01-29" }), "The outcome began on 30/01/2026, so it cannot be closed before then.");
  assert.equal(
    closeDateError({ ...base, date: "2026-04-30", existing: [{ kind: "progress", progress: "no_change", dated_on: "2026-05-01", created_at: "2026-10-13T12:00:00Z" }] }),
    "The outcome has an update dated 01/05/2026, so it cannot be closed before then.",
  );
  assert.equal(closeDateError({ ...base, date: "2026-05-01", existing: [{ kind: "progress", progress: "no_change", dated_on: "2026-05-01", created_at: "2026-10-13T12:00:00Z" }] }), null);
  assert.equal(closeDateError({ ...base, date: "2026-09-01", dischargeDate: "2026-08-31" }), "This person was discharged on 31/08/2026, so the outcome must be closed on or before then.");
  assert.equal(closeDateError({ ...base, date: "2026-10-14" }), null);
});

test("a close date at a month end and over the clock change keeps its day", () => {
  // Stored at midday UTC, the London date reads back the same in summer and winter.
  for (const d of ["2026-08-31", "2026-02-28", "2028-02-29", "2026-10-24", "2026-10-25", "2026-10-26", "2026-03-29"]) {
    assert.equal(londonDate(middayOf(d)), d);
  }
});

test("a past update on a not achieved outcome is worded for it", () => {
  const msg = pastUpdateError({
    date: "2026-08-01", todayIso: "2026-10-14", outcomeFromIso: "2026-01-30", achievedOn: "2026-07-07",
    dischargeDate: null, marksAchieved: false, existing: [], closedAs: "not_achieved",
  });
  assert.equal(msg, "This outcome was closed as not achieved on 07/07/2026, so a past update must be dated on or before then.");
});

test("the counting rule: Not achieved is closed, in scope and not met", async () => {
  const { isOutcomeAchievingOrProgressing, isOutcomeClosed } = await import("./outcome-consts.ts");
  assert.equal(isOutcomeAchievingOrProgressing("achieved"), true);
  assert.equal(isOutcomeAchievingOrProgressing("progressing"), true);
  assert.equal(isOutcomeAchievingOrProgressing("not_achieved"), false);
  assert.equal(isOutcomeClosed("achieved"), true);
  assert.equal(isOutcomeClosed("not_achieved"), true);
  assert.equal(isOutcomeClosed("regressing"), false);
  // One Achieved, one Not achieved, one Progressing, one No change: 4 in scope, 2 met, 50%.
  const statuses = ["achieved", "not_achieved", "progressing", "no_change"] as const;
  const met = statuses.filter((s) => isOutcomeAchievingOrProgressing(s)).length;
  assert.deepEqual(outcomesPqs(met, statuses.length), { rate: 50, band: 2 });
});
