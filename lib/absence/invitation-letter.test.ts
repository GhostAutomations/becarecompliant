import { test } from "node:test";
import assert from "node:assert/strict";
import {
  absenceLine,
  addressLines,
  appealDays,
  buildInvitationLetter,
  buildOutcomeLetterDoc,
  letterBodyParagraphs,
  letterDate,
  letterDay,
  letterSignOff,
  normaliseLetterDates,
  numberWord,
  smallNumbersInWords,
} from "./invitation-letter.ts";

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
  assert.match(l.absenceIntro, /two absences, two days in all, recorded in the last six months/);
  assert.equal(l.absenceLines.length, 2);
  assert.deepEqual(l.opening, ["<p>This is your formal invitation.</p>"]);
  assert.deepEqual(l.closing, ["<p>It could lead to a first written warning.</p>", "<p>You may be accompanied.</p>"]);
  assert.ok(!/[–—]/.test(l.plainText));
});

test("outcome letter: laid out like the invitation, greeting and sign off not printed twice", () => {
  const doc = buildOutcomeLetterDoc({
    companyName: "Sample Care Ltd",
    letterheadAddress: "1 Office Road, Townville, AB1 2CD",
    letterheadPhone: "01234 567890",
    letterDateIso: "2026-10-07",
    recipientName: "Jo Sample",
    recipientAddress: "2 Home Street\nTownville",
    stage: 2,
    meetingTitle: "Disciplinary Hearing",
    conductorName: "Sam Manager",
    conductorRole: "Registered Manager",
    wordingParagraphs: ["Jo Sample,", "Thank you for attending.", "", "The outcome.", "Yours sincerely,\nSam Manager"],
  });
  assert.equal(doc.date, "7th October 2026");
  assert.equal(doc.salutation, "Dear Jo");
  assert.equal(doc.reLine, "RE: Stage 2 Disciplinary Hearing Outcome");
  assert.deepEqual(doc.recipientLines, ["Jo Sample", "2 Home Street", "Townville"]);
  assert.deepEqual(doc.letterheadLines, ["1 Office Road", "Townville", "AB1 2CD"]);
  assert.deepEqual(doc.phoneLines, ["Tel: 01234 567890"]);
  assert.equal(doc.body, "<p>Thank you for attending.</p><p></p><p>The outcome.</p>");
  assert.deepEqual(doc.signOff, { closing: "Yours sincerely", name: "Sam Manager", role: "Registered Manager" });
});

test("letter body keeps a paragraph that only mentions the name", () => {
  assert.deepEqual(letterBodyParagraphs(["Dear Jo,", "Jo explained the absences."], "Jo Sample"), ["Jo explained the absences."]);
});

test("appeal days default to seven", () => {
  assert.equal(appealDays("14"), "14");
  assert.equal(appealDays(""), "7");
  assert.equal(appealDays("abc"), "7");
  assert.equal(appealDays(undefined), "7");
});

/* The Book meeting box holds the whole letter, and the PDF is drawn from it (Phil, 2026-10-08). */
import { cleanLetterBody } from "./invitation-letter.ts";
import { letterPlainText, pdfBlocks } from "../letters/rich-text.ts";

const BASE = {
  companyName: "Bevan Care Ltd",
  letterheadAddress: "Unit 1, Test Park",
  letterheadPhone: "01792 111111",
  letterDateIso: "2026-10-08",
  recipientName: "Jo Bloggs",
  recipientAddress: "1 Street, Town",
  stage: 1,
  stageLabel: "Stage 1 disciplinary hearing",
  meetingTitle: "Disciplinary Hearing",
  meetingDateIso: "2026-10-16",
  meetingTime: "10:00",
  durationMinutes: 60,
  location: "Unit 1, Test Park",
  teams: false,
  conductorName: "Bev Admin",
  conductorRole: "Admin",
  wordingParagraphs: ["This is your formal invitation.", "You have the right to be accompanied."],
  rearrangedNote: null,
  absences: [
    { start_date: "2026-07-14", end_date: "2026-07-14", days: 1, reason: "Cold" },
    { start_date: "2026-08-19", end_date: "2026-08-19", days: 1, reason: "Headache" },
  ],
  windowWords: "6 months",
};

test("the standard letter draws the same letter: paragraphs, details table, absences list", () => {
  const l = buildInvitationLetter(BASE);
  assert.equal(l.body, l.standardBody);
  const blocks = pdfBlocks(l.body);
  assert.deepEqual(blocks.map((b) => b.kind), ["para", "details", "para", "list", "para"]);
  const details = blocks[1];
  assert.ok(details.kind === "details" && details.rows[0].label === "Date" && details.rows[4].label === "Held by");
  const list = blocks[3];
  assert.ok(list.kind === "list" && list.items.length === 2);
  assert.ok(l.plainText.includes(letterPlainText(l.body)));
});

test("an old plain text edit still prints as typed, extra blank lines as space", () => {
  const typed = "First paragraph.\n\n\nAfter extra space.\nSame paragraph, new line.\n\n\u2022 one\n\u2022 two";
  const l = buildInvitationLetter({ ...BASE, bodyOverride: typed });
  const blocks = pdfBlocks(l.body);
  // The meeting details are locked (Phil, 2026-10-12): a letter that lost them gets them back.
  assert.deepEqual(blocks.map((b) => b.kind), ["para", "details", "space", "para", "list"]);
  assert.ok(letterPlainText(l.body).startsWith("First paragraph.\n\nDate: "));
  assert.ok(letterPlainText(l.body).endsWith("\n\n\nAfter extra space.\nSame paragraph, new line.\n\n\u2022 one\n\u2022 two"));
});

test("a formatted edit prints with its formatting", () => {
  const typed = "<h2>Notice</h2><p>Please <strong>attend</strong> <em>on time</em>.</p><ol><li><p>Bring ID</p></li></ol>";
  const l = buildInvitationLetter({ ...BASE, bodyOverride: typed });
  assert.ok(l.body.startsWith("<h2>Notice</h2><p>Date: "));
  assert.ok(l.body.endsWith("<p>Please <strong>attend</strong> <em>on time</em>.</p><ol><li><p>Bring ID</p></li></ol>"));
  assert.deepEqual(pdfBlocks(l.body).map((b) => b.kind), ["heading", "details", "para", "list"]);
});

test("an edited letter's meeting details are always the booking's", () => {
  const typed = "<p>Hello.</p><p>Date: Some other day<br>Time: 23:00</p><p>Bye.</p>";
  const l = buildInvitationLetter({ ...BASE, bodyOverride: typed });
  const details = pdfBlocks(l.body).find((b) => b.kind === "details");
  assert.ok(details && details.kind === "details" && details.rows[1].value === BASE.meetingTime);
});

test("formatted company wording carries into the standard letter", () => {
  const l = buildInvitationLetter({ ...BASE, wordingParagraphs: ["<p>This is your <strong>formal</strong> invitation.</p>", "<p>Bring someone.</p>"] });
  assert.ok(l.standardBody.startsWith("<p>This is your <strong>formal</strong> invitation.</p><p>Date: "));
});

test("an edited letter loses its own Dear line and sign off, and an empty one falls back", () => {
  assert.equal(cleanLetterBody("Dear Jo,\n\nHello.\n\nYours sincerely\nBev", "Jo Bloggs"), "<p>Hello.</p>");
  assert.equal(cleanLetterBody("<p>Dear Jo,</p><p><strong>Hello.</strong></p><p>Yours sincerely</p><p>Bev</p>", "Jo Bloggs"), "<p><strong>Hello.</strong></p>");
  assert.equal(cleanLetterBody("   \n  ", "Jo Bloggs"), "");
  const l = buildInvitationLetter({ ...BASE, bodyOverride: "  " });
  assert.equal(l.body, l.standardBody);
});

test("the sign off follows the signer, else stays with the person holding the meeting", () => {
  assert.deepEqual(letterSignOff("Jo Bloggs", "Registered Manager", null), {
    closing: "Yours sincerely",
    name: "Jo Bloggs",
    role: "Registered Manager",
  });
  assert.deepEqual(letterSignOff("Jo Bloggs", "Registered Manager", { name: "Sam Smith", role: "Supervisor" }), {
    closing: "Yours sincerely",
    name: "Sam Smith",
    role: "Supervisor",
  });
  assert.equal(letterSignOff("Jo Bloggs", null, { name: "  ", role: null }).name, "Jo Bloggs");
});

test("dates in a draft are written as the letter writes them; small numbers in words", () => {
  assert.equal(
    normaliseLetterDates("on 01/10/2026, 21 July 2026 and 3rd May 2026, not 32/13/2026"),
    "on 1st October 2026, 21st July 2026 and 3rd May 2026, not 32/13/2026",
  );
  assert.equal(smallNumbersInWords("6 months, 7 working days, 12 months, Stage 2"), "six months, seven working days, 12 months, Stage 2");
  assert.equal(numberWord(4), "four");
  assert.equal(numberWord(11), "11");
});
