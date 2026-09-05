import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. regulator-defaults.ts has no runtime imports for this reason. */
import {
  defaultComplaintTimescales,
  isRegulator,
  timescaleSource,
} from "./regulator-defaults.ts";

test("THE ASK: a CIW company acknowledges in 2 working days, not 3", () => {
  const w = defaultComplaintTimescales("ciw");
  assert.equal(w.acknowledgement_days, 2);
  assert.equal(w.response_days, 25);
  assert.equal(w.count_working_days, true);
});

test("an England company keeps the 3 working day acknowledgement", () => {
  const e = defaultComplaintTimescales("cqc");
  assert.equal(e.acknowledgement_days, 3);
  assert.equal(e.response_days, 25);
  assert.equal(e.count_working_days, true);
});

test("both nations count WORKING days: the timescales are written in them", () => {
  for (const r of ["ciw", "cqc", null, "", "scotland"]) {
    assert.equal(defaultComplaintTimescales(r).count_working_days, true, String(r));
  }
});

test("an unset regulator gets the LATER acknowledgement, never the sooner one", () => {
  // Showing a company a deadline sooner than the one it is held to is a made up
  // promise; showing a later one is only generous.
  const unknown = defaultComplaintTimescales(null);
  assert.equal(unknown.acknowledgement_days, 3);
  assert.ok(unknown.acknowledgement_days >= defaultComplaintTimescales("ciw").acknowledgement_days);
});

test("nonsense in the regulator column does not throw or produce a bad number", () => {
  for (const bad of [undefined, 0, {}, [], "CIW "]) {
    const t = defaultComplaintTimescales(bad);
    assert.ok(Number.isInteger(t.acknowledgement_days) && t.acknowledgement_days > 0);
    assert.ok(Number.isInteger(t.response_days) && t.response_days > 0);
  }
});

test("the returned object is a copy, so one company cannot edit another's defaults", () => {
  const a = defaultComplaintTimescales("ciw");
  a.response_days = 999;
  assert.equal(defaultComplaintTimescales("ciw").response_days, 25);
});

test("isRegulator accepts exactly the two we support", () => {
  assert.equal(isRegulator("ciw"), true);
  assert.equal(isRegulator("cqc"), true);
  assert.equal(isRegulator("CIW"), false);
  assert.equal(isRegulator(null), false);
});

test("the on screen source names the right regulator and never claims a fixed rule", () => {
  assert.match(timescaleSource("ciw"), /Wales/);
  assert.match(timescaleSource("ciw"), /2 working days/);
  assert.match(timescaleSource("cqc"), /England/);
  assert.match(timescaleSource("cqc"), /3 working days/);
  for (const r of ["ciw", "cqc"]) {
    assert.match(timescaleSource(r), /not a fixed rule/);
  }
});
