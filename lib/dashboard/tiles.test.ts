import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVE_TILES, copyIsOld, msToNextSlot, outOfDateTiles, slotStart } from "./tiles.ts";

const at = (iso: string) => Date.parse(iso);
const allAt = (iso: string) => Object.fromEntries(LIVE_TILES.map((t) => [t, iso]));

test("slots fall on :00, :10, :20 ... in London in summer and winter", () => {
  // BST (UTC+1): 09:10 London is 08:10 UTC.
  assert.equal(new Date(slotStart(at("2026-07-01T08:17:30Z"))).toISOString(), "2026-07-01T08:10:00.000Z");
  // GMT: 12:59 stays in the 12:50 slot.
  assert.equal(new Date(slotStart(at("2026-12-01T12:59:59Z"))).toISOString(), "2026-12-01T12:50:00.000Z");
  assert.equal(msToNextSlot(at("2026-12-01T12:59:00Z")), 60_000);
});

test("a copy built at 10 past is still current at 12 past, old at 20 past", () => {
  assert.equal(copyIsOld("2026-10-15T08:10:05Z", at("2026-10-15T08:12:00Z")), false);
  assert.equal(copyIsOld("2026-10-15T08:10:05Z", at("2026-10-15T08:20:00Z")), true);
  assert.equal(copyIsOld("not a date", at("2026-10-15T08:20:00Z")), true);
});

test("nothing done since: no tile is out of date", () => {
  const tiles = allAt("2026-10-15T08:10:00Z");
  assert.deepEqual(outOfDateTiles(tiles, [{ table_name: "complaints", changed_at: "2026-10-15T07:00:00Z" }]), []);
});

test("a check completed: only the tiles that read it are worked out again", () => {
  const tiles = allAt("2026-10-15T08:10:00Z");
  const out = outOfDateTiles(tiles, [{ table_name: "check_instances", changed_at: "2026-10-15T08:11:00Z" }]);
  assert.deepEqual(out, ["due"]);
  const people = outOfDateTiles(tiles, [{ table_name: "people", changed_at: "2026-10-15T08:11:00Z" }]);
  assert.deepEqual(people, ["due", "absence"]);
});

test("a save that started just before the tile was worked out still counts (the margin)", () => {
  const tiles = allAt("2026-10-15T08:10:30Z");
  const out = outOfDateTiles(tiles, [{ table_name: "holiday_requests", changed_at: "2026-10-15T08:10:00Z" }]);
  assert.deepEqual(out, ["holidays"]);
  assert.deepEqual(outOfDateTiles(tiles, [{ table_name: "holiday_requests", changed_at: "2026-10-15T08:00:00Z" }]), []);
});

test("a tile never worked out is always out of date", () => {
  const tiles = allAt("2026-10-15T08:10:00Z") as Record<string, string | undefined>;
  delete tiles.spend;
  assert.deepEqual(outOfDateTiles(tiles, []), ["spend"]);
});
