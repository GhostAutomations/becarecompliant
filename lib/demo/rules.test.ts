import test from "node:test";
import assert from "node:assert/strict";
import {
  demoPhase,
  demoDaysLeft,
  parseDemoDays,
  demoAreaFor,
  formatActiveTime,
  summariseDemoUsage,
  parseDemoRatings,
  averageRating,
  demoDeleteAt,
} from "./rules.ts";

const end = "2026-10-10T12:00:00.000Z";

test("demo phase: active, survey from two days out, ended, purge after 14 days", () => {
  assert.equal(demoPhase(end, new Date("2026-10-07T12:00:00Z")), "active");
  assert.equal(demoPhase(end, new Date("2026-10-08T12:00:00Z")), "survey");
  assert.equal(demoPhase(end, new Date("2026-10-10T11:59:59Z")), "survey");
  assert.equal(demoPhase(end, new Date("2026-10-10T12:00:00Z")), "ended");
  assert.equal(demoPhase(end, new Date("2026-10-24T11:59:59Z")), "ended");
  assert.equal(demoPhase(end, new Date("2026-10-24T12:00:00Z")), "purge_due");
  assert.equal(demoPhase("not a date"), "ended");
  assert.equal(demoDeleteAt(end).toISOString(), "2026-10-24T12:00:00.000Z");
});

test("days left rounds up and never goes negative", () => {
  assert.equal(demoDaysLeft(end, new Date("2026-10-09T13:00:00Z")), 1);
  assert.equal(demoDaysLeft(end, new Date("2026-10-03T12:00:00Z")), 7);
  assert.equal(demoDaysLeft(end, new Date("2026-10-11T12:00:00Z")), 0);
});

test("demo length: blank is 7, 1 to 365 only, whole numbers", () => {
  assert.deepEqual(parseDemoDays(""), { ok: true, days: 7 });
  assert.deepEqual(parseDemoDays(" 30 "), { ok: true, days: 30 });
  assert.equal(parseDemoDays("0").ok, false);
  assert.equal(parseDemoDays("366").ok, false);
  assert.equal(parseDemoDays("2.5").ok, false);
  assert.equal(parseDemoDays("-3").ok, false);
});

test("area of the app from the path", () => {
  assert.equal(demoAreaFor("/dashboard"), "dashboard");
  assert.equal(demoAreaFor("/people/abc"), "people");
  assert.equal(demoAreaFor("/people/training?branch=x"), "training");
  assert.equal(demoAreaFor("/people/absence"), "absence_holidays");
  assert.equal(demoAreaFor("/service-users/1"), "service_users");
  assert.equal(demoAreaFor("/on-call/log"), "on_call");
  assert.equal(demoAreaFor("/somewhere-new"), "other");
  assert.equal(demoAreaFor("/"), "dashboard");
});

test("active time reads plainly", () => {
  assert.equal(formatActiveTime(0), "0 min");
  assert.equal(formatActiveTime(40), "40 sec");
  assert.equal(formatActiveTime(720), "12 min");
  assert.equal(formatActiveTime(3600), "1 hr");
  assert.equal(formatActiveTime(3900), "1 hr 5 min");
});

test("usage summary: logins, total, average, most used first", () => {
  const u = summariseDemoUsage(
    [
      { active_seconds: 600, last_seen_at: "2026-10-01T10:00:00Z" },
      { active_seconds: 1200, last_seen_at: "2026-10-03T10:00:00Z" },
      { active_seconds: 0, last_seen_at: "2026-10-02T10:00:00Z" },
    ],
    [
      { area: "people", seconds: 900 },
      { area: "reports", seconds: 300 },
      { area: "people", seconds: 300 },
      { area: "forms", seconds: 300 },
    ],
  );
  assert.equal(u.logins, 3);
  assert.equal(u.totalSeconds, 1800);
  assert.equal(u.averageSeconds, 600);
  assert.equal(u.lastSeen, "2026-10-03T10:00:00Z");
  assert.deepEqual(u.areas.map((a) => [a.area, a.seconds, a.share]), [
    ["people", 1200, 67],
    ["forms", 300, 17],
    ["reports", 300, 17],
  ]);
  const empty = summariseDemoUsage([], []);
  assert.equal(empty.averageSeconds, 0);
  assert.equal(empty.lastSeen, null);
});

test("survey ratings must all be 1 to 5", () => {
  const all = (v: string) => () => v;
  assert.equal(parseDemoRatings(all("4")).ok, true);
  assert.equal(parseDemoRatings(all("0")).ok, false);
  assert.equal(parseDemoRatings(all("6")).ok, false);
  assert.equal(parseDemoRatings(all("")).ok, false);
  const one = parseDemoRatings((k) => (k === "reports" ? null : "3"));
  assert.equal(one.ok, false);
  if (!one.ok) assert.match(one.error, /Reports/);
});

test("average rating ignores blanks", () => {
  assert.equal(averageRating([4, 5, null, 3]), 4);
  assert.equal(averageRating([]), null);
  assert.equal(averageRating([5, 4]), 4.5);
});
