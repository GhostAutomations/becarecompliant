import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVisitRecord, clockWhere, visitRecordFileName, type VisitRecordInput } from "./visit-record.ts";

const base: VisitRecordInput = {
  companyName: "Test Care Ltd",
  branchName: "Swansea",
  serviceUserName: "A Service User",
  ssid: "SU1",
  visitDate: "2026-10-16",
  startTime: "13:30",
  endTime: "14:00",
  service: "Care",
  version: 1,
  madeAt: "2026-10-16T13:09:30.000Z",
  carers: [{ personId: "p1", name: "A Carer" }],
  clocks: [
    { personId: "p1", kind: "out", at: "2026-10-16T13:09:30.000Z", method: "gps", location: "outside", distance_m: 340, accuracy_m: 5, reason_code: "met_elsewhere", reason_text: null, flags: [], added_reason: null },
    { personId: "p1", kind: "in", at: "2026-10-16T12:05:00.000Z", method: "gps", location: "inside", distance_m: 12, accuracy_m: 5.4, reason_code: null, reason_text: null, flags: ["offline"], added_reason: null },
  ],
  tasks: [
    { personId: "p1", name: "Prompt fluids", isKey: true, outcome: "done", reason_code: null, reason_text: null, at: "2026-10-16T12:06:00.000Z", flags: [] },
    { personId: "p1", name: "Prompt fluids", isKey: true, outcome: "refused", reason_code: "declined", reason_text: null, at: "2026-10-16T12:07:00.000Z", flags: [] },
  ],
  notes: [
    { id: "n1", personId: "p1", author: "A Carer", body: "Ate well.", at: "2026-10-16T12:30:00.000Z", forNextCarer: false, correctsNoteId: null, flags: [] },
    { id: "n2", personId: "p1", author: "A Carer", body: "Correction: ate half.", at: "2026-10-16T12:40:00.000Z", forNextCarer: false, correctsNoteId: "n1", flags: [] },
  ],
  concerns: [],
};

test("where: a result and a distance, never a map position", () => {
  assert.equal(clockWhere(base.clocks[1]), "by GPS, inside the home's area, 12 m away, accurate to 5 m");
  assert.equal(clockWhere(base.clocks[0]), "by GPS, outside the home's area, 340 m away, accurate to 5 m, reason: Met the service user elsewhere (appointment or outing)");
  assert.equal(clockWhere({ ...base.clocks[0], method: "qr", location: "proved", flags: [] }), "by QR code at the door");
  assert.equal(clockWhere({ ...base.clocks[0], method: "office", location: "office", added_reason: "Phone broke" }), "added by the office: Phone broke");
  assert.equal(clockWhere({ ...base.clocks[0], location: "unclear", distance_m: null, accuracy_m: 900 }), "by GPS, location unclear, accurate to 900 m");
  for (const c of base.clocks) assert.ok(!/\d+\.\d{3,}/.test(clockWhere(c)), "no coordinates");
});

test("the record: clocks in time order, the latest task outcome, corrections linked, no dashes", () => {
  const doc = buildVisitRecord(base);
  assert.equal(doc.title, "Visit record");
  const tables = doc.blocks.filter((b) => b.kind === "table") as Array<{ kind: "table"; rows: { text: string }[][] }>;
  // clock in first, with its flag in words
  assert.equal(tables[0].rows[0][1].text, "Clock in");
  assert.match(tables[0].rows[0][3].text, /Recorded offline, sent later/);
  // one row for the task: its latest outcome
  assert.equal(tables[1].rows.length, 1);
  assert.equal(tables[1].rows[0][1].text, "Refused: Service user declined");
  const notes = doc.blocks.filter((b) => b.kind === "keyvalues") as Array<{ kind: "keyvalues"; pairs: { label: string; value: string }[] }>;
  assert.match(notes[0].pairs[0].label, /corrected at 13:40/);
  assert.match(notes[1].pairs[0].label, /correction to the 13:30 note/);
  const all = JSON.stringify(doc);
  assert.ok(!/\s[-–—]\s/.test(all), "no dashes as punctuation");
});

test("an empty visit says so rather than printing nothing", () => {
  const doc = buildVisitRecord({ ...base, clocks: [], tasks: [], notes: [] });
  const tables = doc.blocks.filter((b) => b.kind === "table") as Array<{ kind: "table"; emptyText?: string }>;
  assert.equal(tables[0].emptyText, "No clock in or out recorded.");
  assert.ok(doc.blocks.some((b) => b.kind === "paragraph" && b.text === "No note was written at this visit."));
});

test("file names: the start time and initials, a later version says when it was updated", () => {
  assert.equal(visitRecordFileName("13:30", "AB", 1, "2026-10-16T13:09:30.000Z"), "13.30 Visit record AB.pdf");
  assert.equal(visitRecordFileName("13:30", "AB", 2, "2026-10-16T13:20:00.000Z"), "13.30 Visit record AB, updated 14.20.pdf");
});
