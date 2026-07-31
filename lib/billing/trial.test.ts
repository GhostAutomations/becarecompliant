/**
 * Unit tests for the trial clock. The lock that closes a customer's account is not
 * something to find out about in production, so every boundary is asserted here.
 *
 * Run: node --experimental-strip-types --test lib/billing/trial.test.ts (or npm test).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { trialState, trialDaysLabel, TRIAL_WARNING_DAYS } from "./trial.ts";

const NOW = new Date("2026-07-29T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

test("no trial date means never locked", () => {
  assert.equal(trialState({ trialEndsAt: null }, NOW).status, "none");
  assert.equal(trialState({ trialEndsAt: undefined }, NOW).status, "none");
  assert.equal(trialState({ trialEndsAt: null }, NOW).daysLeft, null);
});

test("black, and retired diamond, are never on a clock even with a date set", () => {
  assert.equal(trialState({ trialEndsAt: at(-10 * DAY), tier: "black" }, NOW).status, "none");
  assert.equal(trialState({ trialEndsAt: at(-10 * DAY), tier: "diamond" }, NOW).status, "none");
  assert.equal(trialState({ trialEndsAt: at(-10 * DAY), tier: "BLACK" }, NOW).status, "none");
});

test("a fresh 14 day trial is simply trialing", () => {
  const s = trialState({ trialEndsAt: at(14 * DAY), tier: "business" }, NOW);
  assert.equal(s.status, "trialing");
  assert.equal(s.daysLeft, 14);
});

test("the warning window opens at exactly three days and not before", () => {
  assert.equal(trialState({ trialEndsAt: at(3 * DAY) }, NOW).status, "ending_soon");
  // A milligram over three days is still four whole days rounded up, so no warning yet.
  assert.equal(trialState({ trialEndsAt: at(3 * DAY + 1) }, NOW).status, "trialing");
  assert.equal(TRIAL_WARNING_DAYS, 3);
});

test("part of a day still reads as a day, never as zero", () => {
  const s = trialState({ trialEndsAt: at(60 * 60 * 1000) }, NOW);
  assert.equal(s.status, "ending_soon");
  assert.equal(s.daysLeft, 1);
});

test("it expires the instant it passes, not at the end of that day", () => {
  assert.equal(trialState({ trialEndsAt: at(1) }, NOW).status, "ending_soon");
  assert.equal(trialState({ trialEndsAt: at(0) }, NOW).status, "expired");
  assert.equal(trialState({ trialEndsAt: at(-1) }, NOW).status, "expired");
  assert.equal(trialState({ trialEndsAt: at(-30 * DAY) }, NOW).daysLeft, 0);
});

test("a date we cannot read must never lock anybody out", () => {
  assert.equal(trialState({ trialEndsAt: "not a date" }, NOW).status, "none");
  assert.equal(trialState({ trialEndsAt: "" }, NOW).status, "none");
});

test("the day label reads as English", () => {
  assert.equal(trialDaysLabel(1), "1 day left");
  assert.equal(trialDaysLabel(6), "6 days left");
  assert.equal(trialDaysLabel(0), "Trial ended");
  assert.equal(trialDaysLabel(null), "");
});
