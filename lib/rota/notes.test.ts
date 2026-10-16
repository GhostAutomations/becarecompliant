import { test } from "node:test";
import assert from "node:assert/strict";
import { CONCERN_TYPES, concernProblem, needsNotePrompt, noteProblem, notesForCard, type NoteEvent, type NoteRow, type VisitNotes } from "./notes.ts";

const row = (over: Partial<NoteRow>): NoteRow => ({
  id: "n1", event_id: "e1", visit_id: "v1", author: "A Carer", mine: true, body: "Ate well.", for_next_carer: false,
  corrects_note_id: null, corrected_at: null, at: "2026-10-16T12:05:00+00:00", ...over,
});
const ev = (over: Partial<NoteEvent>): NoteEvent => ({
  event_id: "w1", owner: "me", kind: "note", visit_id: "v1", body: "Waiting note", phone_time: "2026-10-16T12:10:00.000Z", ...over,
});

test("a note must have words and fit in 4,000 characters", () => {
  assert.equal(noteProblem("   "), "Write the note first.");
  assert.equal(noteProblem("x".repeat(4001)), "The note is too long (4,000 characters at most).");
  assert.equal(noteProblem("Ate well"), null);
});

test("a concern needs one of the incident types and words", () => {
  assert.ok(CONCERN_TYPES.includes("Fall"));
  assert.equal(CONCERN_TYPES[CONCERN_TYPES.length - 1], "Other");
  assert.equal(concernProblem(null, "x"), "Pick what kind of concern it is.");
  assert.equal(concernProblem("Not a type", "x"), "Pick what kind of concern it is.");
  assert.equal(concernProblem("Fall", "  "), "Say what the concern is.");
  assert.equal(concernProblem("Fall", "Bruise on arm"), null);
});

test("the card splits my notes on this visit, handover notes and earlier notes", () => {
  const server: VisitNotes = {
    visit_id: "v1",
    notes: [
      row({}),
      row({ id: "n2", event_id: "e2", visit_id: "v0", mine: false, author: "B Carer", for_next_carer: true, at: "2026-10-15T18:00:00+00:00", body: "Key safe changed" }),
      row({ id: "n3", event_id: "e3", visit_id: "v0", mine: false, author: "B Carer", at: "2026-10-15T19:00:00+00:00", body: "Slept early" }),
      row({ id: "n4", event_id: "e4", visit_id: "v9", mine: false, author: "C Carer", at: "2026-10-16T08:00:00+00:00", body: "Breakfast eaten" }),
    ],
    concerns: [],
  };
  const card = notesForCard(server, [], "v1", "me");
  assert.deepEqual(card.mine.map((n) => n.key), ["n1"]);
  assert.deepEqual(card.handover.map((n) => n.key), ["n2"]);
  // newest first
  assert.deepEqual(card.earlier.map((n) => n.key), ["n4", "n3"]);
  assert.equal(needsNotePrompt(card), false);
  assert.equal(needsNotePrompt(notesForCard(server, [], "v9", "me")), true);
});

test("a note waiting on the phone shows as mine, and a waiting correction marks the note it corrects", () => {
  const server: VisitNotes = { visit_id: "v1", notes: [row({})], concerns: [] };
  const card = notesForCard(server, [ev({ corrects_event_id: "e1", body: "Correction" })], "v1", "me");
  assert.equal(card.mine.length, 2);
  assert.equal(card.mine[0].correctedAt, "2026-10-16T12:10:00.000Z");
  assert.equal(card.mine[1].waiting, true);
  assert.equal(card.mine[1].correctsAt, "2026-10-16T12:05:00+00:00");
});

test("a waiting note that has arrived is shown once; refused, other visits and other sign ins are left out", () => {
  const server: VisitNotes = { visit_id: "v1", notes: [row({ event_id: "w1" })], concerns: [] };
  assert.equal(notesForCard(server, [ev({})], "v1", "me").mine.length, 1);
  assert.equal(notesForCard(null, [ev({ refused: "No" })], "v1", "me").mine.length, 0);
  assert.equal(notesForCard(null, [ev({ visit_id: "v2" })], "v1", "me").mine.length, 0);
  assert.equal(notesForCard(null, [ev({ owner: "someone else" })], "v1", "me").mine.length, 0);
});

test("a server correction says which note it corrects; the corrected note says when", () => {
  const server: VisitNotes = {
    visit_id: "v1",
    notes: [row({ corrected_at: "2026-10-16T12:20:00+00:00" }), row({ id: "n2", event_id: "e2", corrects_note_id: "n1", at: "2026-10-16T12:20:00+00:00" })],
    concerns: [],
  };
  const card = notesForCard(server, [], "v1", "me");
  assert.equal(card.mine[0].correctedAt, "2026-10-16T12:20:00+00:00");
  assert.equal(card.mine[1].correctsAt, "2026-10-16T12:05:00+00:00");
});

test("concerns: the server's and mine still waiting, oldest first, once", () => {
  const server: VisitNotes = {
    visit_id: "v1", notes: [],
    concerns: [{ id: "c1", event_id: "ce1", category: "Fall", body: "Found on floor", at: "2026-10-16T12:00:00+00:00", status: "open" }],
  };
  const card = notesForCard(server, [ev({ kind: "concern", event_id: "ce2", category: "Other", body: "Odd smell" }), ev({ kind: "concern", event_id: "ce1", category: "Fall" })], "v1", "me");
  assert.deepEqual(card.concerns.map((c) => c.key), ["c1", "ce2"]);
  assert.equal(card.concerns[1].waiting, true);
});
