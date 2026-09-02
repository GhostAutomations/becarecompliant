import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED. */
import {
  WAITING_AMBER_HOURS,
  WAITING_RED_HOURS,
  hoursWaiting,
  waitingTone,
  waitingLabel,
  alertDeliveryLabel,
  needsChase,
  chaseDedupeKey,
  chaseSubject,
  chaseOpening,
} from "./trial-alerts.ts";

const NOW = new Date("2026-09-02T12:00:00Z");
const hoursAgo = (h: number) =>
  new Date(NOW.getTime() - h * 3_600_000).toISOString();

test("waiting time is measured from when they asked, not from when we noticed", () => {
  assert.equal(hoursWaiting({ created_at: hoursAgo(6) }, NOW), 6);
  assert.equal(hoursWaiting({ created_at: hoursAgo(0.4) }, NOW), 0);
});

test("a request from the future, or a broken date, never reads as negative", () => {
  assert.equal(hoursWaiting({ created_at: "2027-01-01T00:00:00Z" }, NOW), 0);
  assert.equal(hoursWaiting({ created_at: "not a date" }, NOW), 0);
});

test("the console colours it fresh, then amber, then red", () => {
  assert.equal(waitingTone(0), "fresh");
  assert.equal(waitingTone(WAITING_AMBER_HOURS - 1), "fresh");
  assert.equal(waitingTone(WAITING_AMBER_HOURS), "amber");
  assert.equal(waitingTone(WAITING_RED_HOURS - 1), "amber");
  assert.equal(waitingTone(WAITING_RED_HOURS), "red");
});

test("it reads in hours, then in days once hours stop meaning anything", () => {
  assert.equal(waitingLabel(0), "Waiting less than an hour");
  assert.equal(waitingLabel(1), "Waiting 1 hour");
  assert.equal(waitingLabel(6), "Waiting 6 hours");
  assert.equal(waitingLabel(47), "Waiting 47 hours");
  assert.equal(waitingLabel(48), "Waiting 2 days");
  // The two real ones, six days in.
  assert.equal(waitingLabel(147), "Waiting 6 days");
});

test("THE ONE THAT MATTERS: an unrecorded alert is never presented as delivered", () => {
  const unknown = alertDeliveryLabel({ founder_alerted_at: null, founder_alert_error: null });
  assert.equal(unknown.ok, false);
  assert.match(unknown.text, /never have been told/);

  const failed = alertDeliveryLabel({
    founder_alerted_at: null,
    founder_alert_error: "Resend 422: invalid to address",
  });
  assert.equal(failed.ok, false);
  assert.match(failed.text, /did not send/);
  // The provider's own words survive, because that is what makes it fixable.
  assert.match(failed.text, /Resend 422/);

  const sent = alertDeliveryLabel({
    founder_alerted_at: "2026-08-27T08:25:11Z",
    founder_alert_error: null,
  });
  assert.equal(sent.ok, true);
});

test("only a request still waiting on the founder is chased", () => {
  assert.equal(needsChase({ status: "new" }), true);
  assert.equal(needsChase({ status: "contacted" }), false);
  assert.equal(needsChase({ status: "provisioned" }), false);
  assert.equal(needsChase({ status: "declined" }), false);
});

test("the chase repeats DAILY, unlike a compliance chaser, so the date is in the key", () => {
  const monday = chaseDedupeKey("req-1", "2026-09-02");
  const tuesday = chaseDedupeKey("req-1", "2026-09-03");
  assert.notEqual(monday, tuesday);
  // Same day, same request: claimed once, so a retry or a double cron cannot double-send.
  assert.equal(monday, chaseDedupeKey("req-1", "2026-09-02"));
  // Different requests never collide.
  assert.notEqual(monday, chaseDedupeKey("req-2", "2026-09-02"));
});

test("the subject is triageable from a lock screen", () => {
  assert.equal(chaseSubject(1, 2), "1 trial request waiting for a reply");
  assert.equal(chaseSubject(2, 2), "2 trial requests waiting for a reply");
  assert.equal(chaseSubject(2, 147), "2 trial requests waiting — oldest 6 days");
  assert.equal(chaseSubject(1, 25), "1 trial request waiting — oldest 1 day");
});

test("the wording gets blunter with age", () => {
  assert.match(chaseOpening(1, 2), /is waiting for a reply/);
  assert.match(chaseOpening(1, 25), /still waiting after more than a day/);
  const stale = chaseOpening(2, 147);
  assert.match(stale, /nobody has replied/);
  assert.match(stale, /6 days/);
  assert.match(stale, /^2 care companies have/);
});

test("one company reads as one company, not as a count", () => {
  assert.match(chaseOpening(1, 1), /^A care company has/);
});
