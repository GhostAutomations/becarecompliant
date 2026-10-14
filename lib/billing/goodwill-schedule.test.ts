import test from "node:test";
import assert from "node:assert/strict";
import { goodwillDates, goodwillDueDate, goodwillNextDate, goodwillSummary, parseGoodwillForm } from "./goodwill-schedule.ts";

test("one off: once, on the start date", () => {
  assert.deepEqual(goodwillDates({ start: "2026-11-01", frequency: "once" }), ["2026-11-01"]);
});

test("weekly: the start date then every 7 days, across a month and a year end", () => {
  assert.deepEqual(goodwillDates({ start: "2026-12-24", frequency: "weekly", times: 3 }), ["2026-12-24", "2026-12-31", "2027-01-07"]);
});

test("weekly across the clock change keeps whole days", () => {
  assert.deepEqual(goodwillDates({ start: "2026-10-21", frequency: "weekly", times: 2 }), ["2026-10-21", "2026-10-28"]);
});

test("monthly on the 31st: the last day of a short month, then back to the 31st", () => {
  assert.deepEqual(goodwillDates({ start: "2026-10-31", frequency: "monthly", times: 6 }), [
    "2026-10-31",
    "2026-11-30",
    "2026-12-31",
    "2027-01-31",
    "2027-02-28",
    "2027-03-31",
  ]);
});

test("monthly through 29 February 2028", () => {
  assert.equal(goodwillDueDate("2028-01-29", "monthly", 1), "2028-02-29");
  assert.equal(goodwillDueDate("2028-01-31", "monthly", 1), "2028-02-29");
  assert.equal(goodwillDueDate("2027-01-29", "monthly", 1), "2027-02-28");
  assert.equal(goodwillDueDate("2028-02-29", "monthly", 12), "2029-02-28");
});

test("ends by count", () => {
  assert.equal(goodwillDates({ start: "2026-11-01", frequency: "monthly", times: 6 }).length, 6);
  assert.equal(goodwillDates({ start: "2026-11-01", frequency: "weekly", times: 1 }).length, 1);
});

test("ends by date: a grant due ON the end date is given, after it is not", () => {
  const d = goodwillDates({ start: "2026-11-01", frequency: "monthly", endDate: "2027-03-31" });
  assert.deepEqual(d, ["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01"]);
  const w = goodwillDates({ start: "2026-11-01", frequency: "weekly", endDate: "2026-11-15" });
  assert.deepEqual(w, ["2026-11-01", "2026-11-08", "2026-11-15"]);
});

test("the same plan always gives the same dates (so each period is a stable key)", () => {
  const plan = { start: "2026-10-31", frequency: "monthly" as const, times: 4 };
  assert.deepEqual(goodwillDates(plan), goodwillDates(plan));
});

test("the summary Phil asked for", () => {
  assert.equal(
    goodwillSummary({ company: "Bevan Care Ltd", sms: 200, ai: 50, plan: { start: "2026-11-01", frequency: "monthly", times: 6 } }),
    "Bevan Care Ltd will get 200 SMS and 50 AI credits every month, 6 times, starting 1 Nov 2026 (last grant 1 Apr 2027).",
  );
  assert.equal(
    goodwillSummary({ company: "Bevan Care Ltd", sms: 0, ai: 25, plan: { start: "2026-10-14", frequency: "once" } }),
    "Bevan Care Ltd will get 25 AI credits once, on 14 Oct 2026.",
  );
});

const okForm = {
  company_id: "84172279-54e4-4d5b-94b4-c92dc05c6baa",
  sms: "200",
  ai: "0",
  frequency: "monthly",
  start: "2026-11-01",
  how_long: "times",
  times: "6",
  end: "",
  reason: "complaint",
  note: "",
};

test("form: a good monthly grant passes", () => {
  const r = parseGoodwillForm(okForm, "2026-10-14");
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual([r.value.sms, r.value.ai, r.value.times, r.value.endDate, r.value.note], [200, 0, 6, null, null]);
});

test("form: refusals each say what to fix", () => {
  const err = (over: Record<string, string>) => {
    const r = parseGoodwillForm({ ...okForm, ...over }, "2026-10-14");
    return r.ok ? "PASSED" : r.error;
  };
  assert.equal(err({ sms: "0", ai: "0" }), "Give at least one SMS or AI credit.");
  assert.equal(err({ sms: "-5" }), "SMS credits must be a whole number (0 or more).");
  assert.equal(err({ ai: "2.5" }), "AI credits must be a whole number (0 or more).");
  assert.equal(err({ start: "2026-10-13" }), "The start date cannot be in the past.");
  assert.equal(err({ times: "0" }), "Enter how many times, from 1 to 520.");
  assert.equal(err({ how_long: "end", end: "2026-10-31" }), "The end date cannot be before the start date.");
  assert.equal(err({ company_id: "" }), "Choose the company.");
  assert.equal(err({ reason: "x" }), "Choose the reason.");
});

test("form: today is allowed; a one off ignores how long; commas in numbers are fine", () => {
  const r = parseGoodwillForm({ ...okForm, frequency: "once", start: "2026-10-14", sms: "2,000" }, "2026-10-14");
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual([r.value.sms, r.value.times, r.value.endDate], [2000, null, null]);
});

test("next date: counts past what has been given", () => {
  const plan = { start: "2026-10-31", frequency: "monthly" as const, times: 3 };
  assert.equal(goodwillNextDate(plan, 0), "2026-10-31");
  assert.equal(goodwillNextDate(plan, 1), "2026-11-30");
  assert.equal(goodwillNextDate(plan, 3), null);
});
