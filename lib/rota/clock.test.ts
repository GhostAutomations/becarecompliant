import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyResults,
  clockOpen,
  clockOutcome,
  clockState,
  codeFromPath,
  locationWords,
  metresBetween,
  minutesUntilOpen,
  nextBatch,
  parseClockText,
  type ClockEvent,
} from "./clock.ts";

const home = { lat: 51.6201, lng: -3.9401, radius: 200 };

test("metres between two points matches the database (about 1,112 m for 0.01 degrees north)", () => {
  assert.equal(metresBetween(home, { lat: 51.6301, lng: -3.9401 }), 1112);
  assert.equal(metresBetween(home, home), 0);
});

test("inside, outside and unclear", () => {
  assert.equal(clockOutcome({ lat: 51.6202, lng: -3.9402, accuracy: 10 }, home).outcome, "inside");
  assert.equal(clockOutcome({ lat: 51.6301, lng: -3.9401, accuracy: 10 }, home).outcome, "outside");
  // rougher than the radius: unclear, never asked for a reason
  assert.equal(clockOutcome({ lat: 51.6202, lng: -3.9402, accuracy: 600 }, home).outcome, "unclear");
  assert.equal(clockOutcome(null, home).outcome, "unclear");
  assert.equal(clockOutcome({ lat: 51.6202, lng: -3.9402, accuracy: 10 }, null).outcome, "unclear");
  // exactly on the edge counts as inside
  const edge = { lat: 51.6201 + 200 / 111195, lng: -3.9401, accuracy: 5 };
  assert.equal(clockOutcome(edge, home).outcome, "inside");
});

test("clock in opens 30 minutes before the start and closes 3 hours after the end", () => {
  const start = Date.parse("2026-10-16T12:00:00Z");
  const end = Date.parse("2026-10-16T12:30:00Z");
  assert.equal(clockOpen(start - 31 * 60_000, start, end), false);
  assert.equal(clockOpen(start - 30 * 60_000, start, end), true);
  assert.equal(clockOpen(end + 3 * 3_600_000, start, end), true);
  assert.equal(clockOpen(end + 3 * 3_600_000 + 1, start, end), false);
  assert.equal(minutesUntilOpen(start - 45 * 60_000, start), 15);
  assert.equal(minutesUntilOpen(start, start), 0);
});

function ev(id: string, over: Partial<ClockEvent> = {}): ClockEvent {
  return {
    event_id: id,
    owner: "me",
    kind: "in",
    target_kind: "visit",
    target_id: "v1",
    method: "gps",
    phone_time: "2026-10-16T12:00:00.000Z",
    ...over,
  };
}

test("the outbox sends only this sign in's waiting events, oldest first, never refused ones", () => {
  const q = [
    ev("c", { phone_time: "2026-10-16T12:10:00.000Z" }),
    ev("a", { phone_time: "2026-10-16T11:00:00.000Z" }),
    ev("other", { owner: "someone else" }),
    ev("r", { refused: "Not yours" }),
    ev("b", { phone_time: "2026-10-16T11:00:00.000Z", device_seq: 2 }),
  ];
  assert.deepEqual(nextBatch(q, "me").map((e) => e.event_id), ["a", "b", "c"]);
  assert.deepEqual(nextBatch(q, "me", 1).map((e) => e.event_id), ["a"]);
  assert.deepEqual(nextBatch(q, "nobody"), []);
});

test("accepted and already had it leave the phone; refused stays with its reason; no answer stays", () => {
  const out = applyResults([
    { event_id: "a", result: "accepted", reason: null },
    { event_id: "b", result: "duplicate", reason: null },
    { event_id: "c", result: "refused", reason: "That visit or shift was never yours." },
  ]);
  assert.deepEqual(out.remove, ["a", "b"]);
  assert.deepEqual(out.refuse, [{ event_id: "c", reason: "That visit or shift was never yours." }]);
  // a send that timed out returns no results: nothing is removed, so it goes again
  assert.deepEqual(applyResults([]), { remove: [], refuse: [] });
});

test("sending the same events twice, or in two overlapping sends, can only ever remove them once", () => {
  const q = [ev("a"), ev("b")];
  const first = applyResults([{ event_id: "a", result: "accepted", reason: null }]);
  const left = q.filter((e) => !first.remove.includes(e.event_id));
  const second = applyResults([
    { event_id: "a", result: "duplicate", reason: null },
    { event_id: "b", result: "accepted", reason: null },
  ]);
  assert.deepEqual(left.filter((e) => !second.remove.includes(e.event_id)), []);
});

test("what the carer sees: the server's times first, then the phone's waiting taps", () => {
  const t = { target_id: "v1", clocked_in_at: null, clocked_out_at: null };
  assert.deepEqual(clockState(t, [], "me"), { inAt: null, outAt: null, inWaiting: false, outWaiting: false });
  const waiting = clockState(t, [ev("a")], "me");
  assert.equal(waiting.inWaiting, true);
  assert.equal(waiting.inAt, "2026-10-16T12:00:00.000Z");
  const sent = clockState({ ...t, clocked_in_at: "2026-10-16T12:01:00Z" }, [ev("a")], "me");
  assert.equal(sent.inWaiting, false);
  assert.equal(sent.inAt, "2026-10-16T12:01:00Z");
  // someone else's waiting tap on the same phone is never shown as this carer's
  assert.equal(clockState(t, [ev("x", { owner: "someone else" })], "me").inWaiting, false);
});

test("the office's words for where a clock in happened", () => {
  assert.equal(locationWords({ location: "inside", distance_m: 12, reason_code: null, reason_text: null, method: "gps" }), "At the home");
  assert.equal(locationWords({ location: "outside", distance_m: 1112, reason_code: "poor_signal", reason_text: null, method: "gps" }), "1,112 m away: Poor signal");
  assert.equal(locationWords({ location: "outside", distance_m: 400, reason_code: "other", reason_text: "Road closed", method: "gps" }), "400 m away: Road closed");
  assert.equal(locationWords({ location: "proved", distance_m: null, reason_code: null, reason_text: null, method: "nfc" }), "NFC sticker");
  assert.equal(locationWords({ location: "unclear", distance_m: null, reason_code: null, reason_text: null, method: "gps" }), "Location unclear");
});

test("a scanned link gives its code; anything else does not", () => {
  const tok = "a".repeat(36);
  assert.equal(codeFromPath(`/c/${tok}`), tok);
  assert.equal(codeFromPath(`/c/${tok}/`), tok);
  assert.equal(codeFromPath("/c/short"), null);
  assert.equal(codeFromPath("/clock"), null);
});

test("a clock in text is IN or OUT and a five character code, nothing else", () => {
  assert.deepEqual(parseClockText("in ab3cd"), { kind: "in", code: "AB3CD" });
  assert.deepEqual(parseClockText("  OUT   AB3CD. "), { kind: "out", code: "AB3CD" });
  assert.equal(parseClockText("STOP"), null);
  assert.equal(parseClockText("in the car, running late"), null);
  assert.equal(parseClockText("in AB3C"), null);
});
