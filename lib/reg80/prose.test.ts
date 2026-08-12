import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. prose.ts has no runtime imports at all, which is why it can be
 *  tested directly. */
import { incidentLines, safeguardingLines, whistleblowingLines } from "./prose.ts";

/**
 * These exist because of a real Reg 80 draft generated on the live site, which said:
 *
 *   "1 incidents occurred at Cardiff1 between 2026-02-12 and 2026-08-12."
 *
 * Counts correct, tests green, tsc clean, and two defects in one sentence of a document a
 * regulator reads. The singular case is the one that goes wrong, so it is the one tested.
 */

const PERIOD = "between 12 February 2026 and 12 August 2026";

type Inc = Parameters<typeof incidentLines>[0];

function inc(over: Partial<Inc> = {}): Inc {
  return {
    total: 0,
    notifiable: 0,
    notified: 0,
    awaitingNotification: 0,
    safeguarding: 0,
    referred: 0,
    awaitingReferral: 0,
    open: 0,
    underReview: 0,
    closed: 0,
    byCategory: [],
    ...over,
  };
}

test("one incident reads as one incident", () => {
  const lines = incidentLines(inc({ total: 1, byCategory: [{ category: "Fall", count: 1 }] }), "Cardiff1", PERIOD);
  assert.equal(lines[0], `1 incident occurred at Cardiff1 ${PERIOD}.`);
  assert.doesNotMatch(lines.join("\n"), /1 incidents/);
});

test("two incidents read as two incidents", () => {
  const lines = incidentLines(inc({ total: 2 }), "Cardiff1", PERIOD);
  assert.match(lines[0], /^2 incidents occurred/);
});

test("no ISO date ever reaches the prose", () => {
  const all = [
    ...incidentLines(inc({ total: 3 }), "Cardiff1", PERIOD),
    ...safeguardingLines(inc({ total: 3 })),
    ...(whistleblowingLines(
      { readable: true, total: 1, anonymous: 1, named: 0, open: 1, underReview: 0, closed: 0, byCategory: [], medianDaysToClose: null },
      "Cardiff1",
      PERIOD,
    ) ?? []),
  ].join("\n");
  assert.doesNotMatch(all, /\d{4}-\d{2}-\d{2}/);
});

test("a single notifiable incident agrees with its verb, in both states", () => {
  const outstanding = incidentLines(inc({ total: 1, notifiable: 1, awaitingNotification: 1 }), "Cardiff1", PERIOD);
  assert.match(outstanding.join("\n"), /1 of those was notifiable to the regulator\./);
  assert.match(outstanding.join("\n"), /1 notification is still outstanding\./);

  const done = incidentLines(inc({ total: 1, notifiable: 1, notified: 1 }), "Cardiff1", PERIOD);
  assert.match(done.join("\n"), /It has a notification recorded\./);
});

test("two outstanding notifications read as plural", () => {
  const lines = incidentLines(inc({ total: 5, notifiable: 3, notified: 1, awaitingNotification: 2 }), "Cardiff1", PERIOD);
  assert.match(lines.join("\n"), /3 of them were notifiable to the regulator\./);
  assert.match(lines.join("\n"), /2 notifications are still outstanding\./);
});

test("no incidents produces a sentence, not a stray zero", () => {
  assert.deepEqual(incidentLines(inc(), "Cardiff1", PERIOD), [
    `No incidents were recorded for Cardiff1 ${PERIOD}.`,
  ]);
  assert.match(safeguardingLines(inc())[0], /^No incidents were recorded in the period/);
});

test('one escalation out of one incident is not "1 of the 1 incidents were"', () => {
  const lines = safeguardingLines(inc({ total: 1, safeguarding: 1, referred: 1 }));
  assert.equal(lines[0], "1 of the 1 incident in the period was escalated to safeguarding.");
  assert.equal(lines[1], "It has a referral date recorded.");
});

test("an unreferred escalation says so", () => {
  const lines = safeguardingLines(inc({ total: 4, safeguarding: 2, referred: 1, awaitingReferral: 1 }));
  assert.match(lines[0], /^2 of the 4 incidents in the period were escalated/);
  assert.equal(lines[1], "1 has a referral date recorded and 1 does not.");
});

test("WHISTLEBLOWING IS ABSENT, NOT ZERO, when the reader may not see the register", () => {
  // The point of the readable flag: a branch manager's draft must not assert that no
  // disclosures were received, because they cannot see whether any were.
  assert.equal(whistleblowingLines({ readable: false }, "Cardiff1", PERIOD), null);
});

test("a reader who may see the register gets a real zero when there genuinely are none", () => {
  const lines = whistleblowingLines(
    { readable: true, total: 0, anonymous: 0, named: 0, open: 0, underReview: 0, closed: 0, byCategory: [], medianDaysToClose: null },
    "Cardiff1",
    PERIOD,
  );
  assert.deepEqual(lines, [`No whistleblowing disclosures were received ${PERIOD}.`]);
});

test("one disclosure reads singular, and says the figure is company wide", () => {
  const lines = whistleblowingLines(
    { readable: true, total: 1, anonymous: 1, named: 0, open: 1, underReview: 0, closed: 0, byCategory: [{ category: "Medication practice", count: 1 }], medianDaysToClose: null },
    "Cardiff1",
    PERIOD,
  )!;
  assert.match(lines[0], /^1 whistleblowing disclosure was received/);
  assert.match(lines.join("\n"), /1 was made anonymously\./);
  assert.match(lines.join("\n"), /covers the whole company and not Cardiff1 alone/);
});

test('a one day median does not read as "1 days"', () => {
  const lines = whistleblowingLines(
    { readable: true, total: 2, anonymous: 0, named: 2, open: 0, underReview: 0, closed: 2, byCategory: [{ category: "Health and safety", count: 2 }], medianDaysToClose: 1 },
    "Cardiff1",
    PERIOD,
  )!;
  assert.match(lines.join("\n"), /typically closed in 1 day\./);
  assert.doesNotMatch(lines.join("\n"), /1 days/);
  assert.match(lines.join("\n"), /None were made anonymously\./);
});
