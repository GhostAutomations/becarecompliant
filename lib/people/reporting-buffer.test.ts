import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. reporting-buffer.ts has no runtime imports for this reason. */
import { bufferNote, reportingBuffer } from "./reporting-buffer.ts";

test("THE POINT: 80 planned against 90 reported is a ten day buffer", () => {
  assert.equal(reportingBuffer(80, 90), 10);
  const note = bufferNote(80, 90);
  assert.equal(note?.tone, "buffer");
  assert.equal(note?.days, 10);
  assert.match(note!.text, /a 10 day buffer/);
});

test("it is called a buffer, which is the word used here, never slack", () => {
  for (const pair of [[80, 90], [85, 90], [30, 45]] as const) {
    const note = bufferNote(pair[0], pair[1]);
    assert.doesNotMatch(note!.text, /slack/i, `${pair[0]}/${pair[1]}`);
  }
  assert.doesNotMatch(bufferNote(90, 90)!.text, /slack/i);
  assert.doesNotMatch(bufferNote(90, 80)!.text, /slack/i);
});

test("THE ASK: change 80 to 85 and the buffer says 5", () => {
  assert.equal(reportingBuffer(85, 90), 5);
  assert.match(bufferNote(85, 90)!.text, /a 5 day buffer/);
});

test("the deadline reads as a day, not days, when it qualifies the noun", () => {
  assert.match(bufferNote(80, 90)!.text, /90 day reporting deadline/);
  assert.match(bufferNote(89, 90)!.text, /a 1 day buffer/);
});

test("no deadline set means nothing to say", () => {
  assert.equal(reportingBuffer(80, null), null);
  assert.equal(bufferNote(80, null), null);
  assert.equal(bufferNote(80, undefined), null);
});

test("a missing or nonsense cadence says nothing rather than guessing", () => {
  assert.equal(bufferNote(null, 90), null);
  assert.equal(bufferNote(0, 90), null);
  assert.equal(bufferNote(-80, 90), null);
  assert.equal(bufferNote(80, 0), null);
  assert.equal(bufferNote(Number.NaN, 90), null);
});

test("equal numbers are called out: no slack at all", () => {
  const note = bufferNote(90, 90);
  assert.equal(note?.tone, "none");
  assert.equal(note?.days, 0);
  assert.match(note!.text, /one day late is a late report/);
});

test("THE UNWORKABLE SETTING: a deadline sooner than the plan is refused in words", () => {
  const note = bufferNote(90, 80);
  assert.equal(note?.tone, "over");
  assert.equal(note?.days, -10);
  assert.match(note!.text, /every completion counts as late/);
});

test("the numbers in the sentence are the ones that were passed in", () => {
  const note = bufferNote(30, 45);
  assert.match(note!.text, /every 30 days/);
  assert.match(note!.text, /45 day reporting deadline/);
  assert.equal(note!.days, 15);
});
