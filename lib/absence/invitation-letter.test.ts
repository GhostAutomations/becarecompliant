import { test } from "node:test";
import assert from "node:assert/strict";
import { absenceLine, addressLines, buildInvitationLetter, letterDate, letterDay } from "./invitation-letter.ts";

test("dates read the way Thistle's letters write them", () => {
  assert.equal(letterDate("2026-10-02"), "2nd October 2026");
  assert.equal(letterDate("2026-04-11"), "11th April 2026");
  assert.equal(letterDate("2026-08-13"), "13th August 2026");
  assert.equal(letterDate("2026-05-21"), "21st May 2026");
  assert.equal(letterDay("2026-10-20"), "Tuesday 20th October 2026");
});

test("addresses split on commas or lines", () => {
  assert.deepEqual(addressLines("Unit 8 Castleton Court, Fortran Road, Cardiff CF3 0LT"), [
    "Unit 8 Castleton Court",
    "Fortran Road",
    "Cardiff CF3 0LT",
  ]);
  assert.deepEqual(addressLines("Flat 2, 10 Example Street\nNewport"), ["Flat 2, 10 Example Street", "Newport"]);
  assert.deepEqual(addressLines(null), []);
});

test("an absence line has its date, reason and length, and no dashes", () => {
  assert.equal(absenceLine({ start_date: "2026-04-11", end_date: null, days: 1, reason: "Sickness" }), "11th April 2026: Sickness, 1 day");
  assert.equal(
    absenceLine({ start_date: "2026-06-01", end_date: "2026-06-03", days: "3", reason: null }),
    "1st June 2026 to 3rd June 2026: No reason recorded, 3 days",
  );
});

test("the letter carries everything Thistle's did", () => {
  const l = buildInvitationLetter({
    companyName: "Thistle Care Ltd",
    letterheadAddress: "Unit 8 Castleton Court, Fortran Road, St Mellons, Cardiff, CF3 0LT",
    letterheadPhone: "029 2018 0999, 01632 960123",
    letterDateIso: "2026-10-02",
    recipientName: "Jo Bloggs",
    recipientAddress: "Flat 2, 10 Example Street\nNewport\nAB1 2CD",
    stage: 2,
    stageLabel: "Stage 2 disciplinary hearing",
    meetingTitle: "Disciplinary Hearing",
    meetingDateIso: "2026-10-20",
    meetingTime: "11:00",
    durationMinutes: 60,
    location: "Unit 8 Castleton Court, Fortran Road, St Mellons, Cardiff, CF3 0LT",
    teams: false,
    conductorName: "Charlotte Davies",
    conductorRole: "Manager",
    wordingParagraphs: ["This is your formal invitation.", "It could lead to a first written warning.", "You may be accompanied."],
    rearrangedNote: null,
    absences: [
      { start_date: "2026-04-11", end_date: null, days: 1, reason: "Sickness" },
      { start_date: "2026-06-07", end_date: null, days: 1, reason: "Engine management trouble with car" },
    ],
    windowWords: "6 months",
  });
  assert.equal(l.salutation, "Dear Jo");
  assert.equal(l.reLine, "RE: Stage 2 Disciplinary Hearing Invitation");
  assert.deepEqual(l.phoneLines, ["Tel: 029 2018 0999", "Tel: 01632 960123"]);
  assert.deepEqual(l.recipientLines, ["Jo Bloggs", "Flat 2, 10 Example Street", "Newport", "AB1 2CD"]);
  assert.equal(l.details[0].value, "Tuesday 20th October 2026");
  assert.equal(l.details[4].value, "Charlotte Davies, Manager");
  assert.match(l.absenceIntro, /2 absences, 2 days in all, recorded in the last 6 months/);
  assert.equal(l.absenceLines.length, 2);
  assert.deepEqual(l.opening, ["This is your formal invitation."]);
  assert.deepEqual(l.closing, ["It could lead to a first written warning.", "You may be accompanied."]);
  assert.ok(!/[–—]/.test(l.plainText));
});
