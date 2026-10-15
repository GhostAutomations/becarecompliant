import { test } from "node:test";
import assert from "node:assert/strict";
import { londonWallToUtc, mondayOfIso, workedMinutes, workingTimeWarnings, type ShiftSpan } from "./working-time.ts";

/** A shift on a London civil date, from wall clock times (an end at or before the start is next day). */
function shift(id: string, date: string, start: string, end: string, breakMinutes = 0): ShiftSpan {
  const s = londonWallToUtc(date, start);
  const nextDay = end <= start;
  const endDate = nextDay ? new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : date;
  const e = londonWallToUtc(endDate, end);
  return { id, shiftDate: date, startsAt: new Date(s).toISOString(), endsAt: new Date(e).toISOString(), breakMinutes };
}
const kinds = (w: { kind: string }[]) => w.map((x) => x.kind).sort();

test("London wall clock to UTC: summer is an hour behind, winter is not", () => {
  assert.equal(new Date(londonWallToUtc("2026-07-01", "09:00")).toISOString(), "2026-07-01T08:00:00.000Z");
  assert.equal(new Date(londonWallToUtc("2026-12-01", "09:00")).toISOString(), "2026-12-01T09:00:00.000Z");
});

test("the clocks going back: an overnight shift 00:00 to 08:00 on 25 Oct 2026 is 9 hours", () => {
  assert.equal(workedMinutes(shift("a", "2026-10-25", "00:00", "08:00")), 9 * 60);
});

test("the clocks going forward: 00:00 to 08:00 on 28 Mar 2027 is 7 hours", () => {
  assert.equal(workedMinutes(shift("a", "2027-03-28", "00:00", "08:00")), 7 * 60);
});

test("an overnight shift ends the next day, and a break is not working time", () => {
  assert.equal(workedMinutes(shift("a", "2026-11-20", "22:00", "07:00", 30)), 8.5 * 60);
});

test("Monday of the week, across a month end and a year end", () => {
  assert.equal(mondayOfIso("2026-11-01"), "2026-10-26");
  assert.equal(mondayOfIso("2027-01-01"), "2026-12-28");
  assert.equal(mondayOfIso("2026-11-02"), "2026-11-02");
});

test("over 6 hours with no 20 minute break warns; with 20 minutes it does not", () => {
  assert.deepEqual(kinds(workingTimeWarnings([], shift("a", "2026-11-02", "08:00", "14:30", 0), { optedOut48: false })), ["break"]);
  assert.deepEqual(kinds(workingTimeWarnings([], shift("a", "2026-11-02", "08:00", "14:30", 20), { optedOut48: false })), []);
  assert.deepEqual(kinds(workingTimeWarnings([], shift("a", "2026-11-02", "08:00", "14:00", 0), { optedOut48: false })), []);
});

test("under 11 hours rest before a shift on the next day warns; two shifts on the same day do not", () => {
  const late = shift("late", "2026-11-02", "14:00", "22:00", 30);
  const early = shift("early", "2026-11-03", "07:00", "12:00");
  assert.deepEqual(kinds(workingTimeWarnings([late], early, { optedOut48: false })), ["rest"]);
  const fine = shift("fine", "2026-11-03", "09:00", "12:00");
  assert.deepEqual(kinds(workingTimeWarnings([late], fine, { optedOut48: false })), []);
  const split = shift("split", "2026-11-02", "06:00", "10:00");
  assert.deepEqual(kinds(workingTimeWarnings([late], split, { optedOut48: false })), []);
});

test("over 48 hours in a week warns unless the person has signed the opt out", () => {
  // Five 12 hour shifts with a 30 minute break: 57.5 hours, Monday to Friday.
  const week = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map((d, i) => shift(`s${i}`, d, "07:00", "19:00", 30));
  const candidate = shift("c", "2026-11-06", "07:00", "19:00", 30);
  assert.ok(kinds(workingTimeWarnings(week, candidate, { optedOut48: false })).includes("weekly_hours"));
  assert.ok(!kinds(workingTimeWarnings(week, candidate, { optedOut48: true })).includes("weekly_hours"));
});

test("the 48 hours is an average: a heavy week after a light one is fine", () => {
  const lastWeek = [shift("p", "2026-10-26", "09:00", "17:00", 30)];
  const week = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map((d, i) => shift(`s${i}`, d, "07:00", "19:00", 30));
  const candidate = shift("c", "2026-11-06", "07:00", "19:00", 30);
  // (57.5 + 7.5) / 2 = 32.5 a week.
  assert.ok(!kinds(workingTimeWarnings([...lastWeek, ...week], candidate, { optedOut48: false })).includes("weekly_hours"));
});

test("no day off in the week, and none in the fortnight, warns", () => {
  const days = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01",
    "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"];
  const worked = days.map((d, i) => shift(`d${i}`, d, "08:00", "20:00", 30));
  const sunday = shift("sun", "2026-11-08", "08:00", "20:00", 30);
  assert.ok(kinds(workingTimeWarnings(worked, sunday, { optedOut48: true })).includes("day_off"));
});

test("a full day off in the week means no day off warning", () => {
  const week = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"].map((d, i) => shift(`s${i}`, d, "09:00", "15:00"));
  const candidate = shift("c", "2026-11-08", "09:00", "15:00");
  assert.ok(!kinds(workingTimeWarnings(week, candidate, { optedOut48: true })).includes("day_off"));
});
