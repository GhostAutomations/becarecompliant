import { test } from "node:test";
import assert from "node:assert/strict";
import { compareCandidates, distanceBand, extractPostcode, milesBetween, milesLabel, normalisePostcode, type Rankable } from "./geo.ts";

test("postcodes are normalised, and junk is not a postcode", () => {
  assert.equal(normalisePostcode("sa1 1aa"), "SA1 1AA");
  assert.equal(normalisePostcode("SA11AA"), "SA1 1AA");
  assert.equal(normalisePostcode("  cf10   3at "), "CF10 3AT");
  assert.equal(normalisePostcode("EC1A1BB"), "EC1A 1BB");
  assert.equal(normalisePostcode("hello"), null);
  assert.equal(normalisePostcode(null), null);
});

test("a postcode is read out of a home address", () => {
  assert.equal(extractPostcode("12 High Street, Neath, SA11 3BD"), "SA11 3BD");
  assert.equal(extractPostcode("Flat 2, Swansea"), null);
});

test("straight line miles: Cardiff to Swansea is about 35", () => {
  const cardiff = { lat: 51.4816, lng: -3.1791 };
  const swansea = { lat: 51.6214, lng: -3.9436 };
  const m = milesBetween(cardiff, swansea);
  assert.ok(m > 33 && m < 37, String(m));
  assert.equal(milesBetween(cardiff, cardiff), 0);
});

test("distance bands", () => {
  assert.equal(distanceBand(1.5), 0);
  assert.equal(distanceBand(4), 1);
  assert.equal(distanceBand(8), 2);
  assert.equal(distanceBand(30), 3);
  assert.equal(distanceBand(null), 4);
});

const base: Rankable = { name: "A", refusal: null, warnings: 0, miles: 3, preferred: false, continuity: 0 };

test("those who can go come before those who cannot, and compliant before warnings", () => {
  const list = [
    { ...base, name: "Refused", refusal: "No Right to Work", miles: 0.1 },
    { ...base, name: "Warned", warnings: 1, miles: 0.2 },
    { ...base, name: "Clean", miles: 9 },
  ].sort(compareCandidates);
  assert.deepEqual(list.map((x) => x.name), ["Clean", "Warned", "Refused"]);
});

test("then nearest by band, then preferred, then continuity", () => {
  const list = [
    { ...base, name: "Far", miles: 12, preferred: true, continuity: 9 },
    { ...base, name: "Near stranger", miles: 4 },
    { ...base, name: "Near known", miles: 4.5, continuity: 3 },
    { ...base, name: "Near preferred", miles: 4.9, preferred: true },
  ].sort(compareCandidates);
  assert.deepEqual(list.map((x) => x.name), ["Near preferred", "Near known", "Near stranger", "Far"]);
});

test("no postcode ranks after any known distance", () => {
  const list = [{ ...base, name: "Unknown", miles: null, continuity: 5 }, { ...base, name: "Far", miles: 25 }].sort(compareCandidates);
  assert.deepEqual(list.map((x) => x.name), ["Far", "Unknown"]);
});

test("miles labels", () => {
  assert.equal(milesLabel(0.43), "0.4 miles");
  assert.equal(milesLabel(1.2), "1 mile");
  assert.equal(milesLabel(6.6), "7 miles");
  assert.equal(milesLabel(null), null);
});
