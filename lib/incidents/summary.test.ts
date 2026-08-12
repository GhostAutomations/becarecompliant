import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  summariseIncidents,
  needsAction,
  withinRange,
  type CountableIncident,
} from "./summary.ts";

function inc(over: Partial<CountableIncident> = {}): CountableIncident {
  return {
    occurred_on: "2026-05-10",
    category: "Fall",
    notifiable: false,
    notified_on: null,
    safeguarding: false,
    safeguarding_referred_on: null,
    status: "open",
    ...over,
  };
}

test("withinRange is inclusive at both ends and open ended on a null bound", () => {
  assert.equal(withinRange("2026-01-01", "2026-01-01", "2026-06-30"), true);
  assert.equal(withinRange("2026-06-30", "2026-01-01", "2026-06-30"), true);
  assert.equal(withinRange("2025-12-31", "2026-01-01", "2026-06-30"), false);
  assert.equal(withinRange("2026-07-01", "2026-01-01", "2026-06-30"), false);
  assert.equal(withinRange("2019-01-01", null, "2026-06-30"), true);
  assert.equal(withinRange("2099-01-01", "2026-01-01", null), true);
});

test("withinRange tolerates a timestamp and rejects rubbish", () => {
  assert.equal(withinRange("2026-03-04T22:15:00Z", "2026-03-01", "2026-03-31"), true);
  assert.equal(withinRange("not a date", null, null), false);
  assert.equal(withinRange("", null, null), false);
});

test("an empty set summarises to zeros, not to nulls", () => {
  const s = summariseIncidents([]);
  assert.equal(s.total, 0);
  assert.equal(s.notifiable, 0);
  assert.deepEqual(s.byCategory, []);
});

test("the headline figures reconcile: total, notifiable, referred", () => {
  const s = summariseIncidents([
    inc({ notifiable: true, notified_on: "2026-05-11" }),
    inc({ notifiable: true }),
    inc({ safeguarding: true, safeguarding_referred_on: "2026-05-12" }),
    inc({ notifiable: true, notified_on: "2026-05-13", safeguarding: true }),
    inc(),
  ]);
  assert.equal(s.total, 5);
  assert.equal(s.notifiable, 3);
  assert.equal(s.notified, 2);
  assert.equal(s.awaitingNotification, 1);
  assert.equal(s.safeguarding, 2);
  assert.equal(s.referred, 1);
  assert.equal(s.awaitingReferral, 1);
  // notified + awaiting must always account for every notifiable incident
  assert.equal(s.notified + s.awaitingNotification, s.notifiable);
  assert.equal(s.referred + s.awaitingReferral, s.safeguarding);
});

test("one incident that is both notifiable and safeguarding is counted once in the total", () => {
  const s = summariseIncidents([inc({ notifiable: true, safeguarding: true })]);
  assert.equal(s.total, 1);
  assert.equal(s.notifiable, 1);
  assert.equal(s.safeguarding, 1);
});

test("statuses are counted separately and add up to the total", () => {
  const s = summariseIncidents([
    inc({ status: "open" }),
    inc({ status: "open" }),
    inc({ status: "under_review" }),
    inc({ status: "closed" }),
  ]);
  assert.equal(s.open, 2);
  assert.equal(s.underReview, 1);
  assert.equal(s.closed, 1);
  assert.equal(s.open + s.underReview + s.closed, s.total);
});

test("categories are commonest first, ties alphabetical", () => {
  const s = summariseIncidents([
    inc({ category: "Near miss" }),
    inc({ category: "Fall" }),
    inc({ category: "Fall" }),
    inc({ category: "Medication error" }),
  ]);
  assert.deepEqual(s.byCategory, [
    { category: "Fall", count: 2 },
    { category: "Medication error", count: 1 },
    { category: "Near miss", count: 1 },
  ]);
});

test("a blank category is counted as Other rather than as an empty row", () => {
  const s = summariseIncidents([inc({ category: "  " }), inc({ category: "Other" })]);
  assert.deepEqual(s.byCategory, [{ category: "Other", count: 2 }]);
});

test("the range filters on when it happened, not when it was recorded", () => {
  const rows = [
    inc({ occurred_on: "2025-12-31" }),
    inc({ occurred_on: "2026-01-01" }),
    inc({ occurred_on: "2026-06-30" }),
    inc({ occurred_on: "2026-07-01" }),
  ];
  assert.equal(summariseIncidents(rows, { from: "2026-01-01", to: "2026-06-30" }).total, 2);
  assert.equal(summariseIncidents(rows).total, 4);
});

test("needsAction returns only unfinished duties, oldest first", () => {
  const rows = [
    inc({ occurred_on: "2026-05-03", notifiable: true }),
    inc({ occurred_on: "2026-05-01", safeguarding: true }),
    inc({ occurred_on: "2026-05-02", notifiable: true, notified_on: "2026-05-02" }),
    inc({ occurred_on: "2026-04-01" }),
  ];
  const out = needsAction(rows);
  assert.equal(out.length, 2);
  assert.equal(out[0].occurred_on, "2026-05-01");
  assert.equal(out[1].occurred_on, "2026-05-03");
});

test("a closed incident with an outstanding notification still needs action", () => {
  // Closing the record does not discharge the duty to notify. If this ever flips to
  // "closed means done", a provider can bury an un-notified incident by closing it.
  const out = needsAction([inc({ notifiable: true, status: "closed" })]);
  assert.equal(out.length, 1);
});
