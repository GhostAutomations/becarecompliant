import { test } from "node:test";
import assert from "node:assert/strict";
import { createToken, dbsChoice, hasAnyAnswer, riskEmailNotice, riskEmailRecipients, rtwAnswers } from "./add-person-docs.ts";

test("DBS: the details, or the tick, never both and never neither", () => {
  const details = JSON.stringify({ dbs_date: "2026-01-10", certificate_number: "001" });
  assert.deepEqual(dbsChoice({ none: null, answers: details }), { kind: "details", answers: { dbs_date: "2026-01-10", certificate_number: "001" } });
  assert.deepEqual(dbsChoice({ none: "1", answers: null }), { kind: "none" });
  assert.deepEqual(dbsChoice({ none: "1", answers: "{}" }), { kind: "none" });
  assert.equal(dbsChoice({ none: "1", answers: details }).kind, "error");
  const neither = dbsChoice({ none: null, answers: "{}" });
  assert.equal(neither.kind, "error");
  assert.match((neither as { error: string }).error, /No DBS yet/);
  assert.equal(dbsChoice({ none: "", answers: "not json" }).kind, "error");
  // Blank values typed and cleared are not details.
  assert.equal(dbsChoice({ none: null, answers: JSON.stringify({ dbs_date: "", certificate_number: "  " }) }).kind, "error");
});

test("Right to Work is required", () => {
  assert.deepEqual(rtwAnswers(JSON.stringify({ check_date: "2026-10-15", rtw_type: "settled" })), {
    ok: true,
    answers: { check_date: "2026-10-15", rtw_type: "settled" },
  });
  assert.equal(rtwAnswers("").ok, false);
  assert.equal(rtwAnswers("{}").ok, false);
  assert.equal(rtwAnswers(JSON.stringify({ files: [] })).ok, false);
});

test("hasAnyAnswer ignores blanks and empty lists", () => {
  assert.equal(hasAnyAnswer(null), false);
  assert.equal(hasAnyAnswer({ a: "", b: [], c: null }), false);
  assert.equal(hasAnyAnswer({ a: "x" }), true);
  assert.equal(hasAnyAnswer({ a: ["x"] }), true);
});

test("the risk assessment email goes to the adder and the line manager, once each", () => {
  const adder = { profileId: "a", email: "a@example.com", name: "Adder" };
  const manager = { profileId: "m", email: "m@example.com", name: "Manager" };
  assert.deepEqual(riskEmailRecipients(adder, manager).map((r) => r.profileId), ["a", "m"]);
  assert.deepEqual(riskEmailRecipients(adder, { ...adder }).map((r) => r.profileId), ["a"]);
  assert.deepEqual(riskEmailRecipients(adder, { profileId: "m2", email: "A@Example.com", name: null }).map((r) => r.profileId), ["a"]);
  assert.deepEqual(riskEmailRecipients(adder, null).map((r) => r.profileId), ["a"]);
  assert.deepEqual(riskEmailRecipients(adder, { profileId: "m", email: null, name: "No login" }).map((r) => r.profileId), ["a"]);
  assert.deepEqual(riskEmailRecipients({ profileId: "a", email: "", name: null }, manager).map((r) => r.profileId), ["m"]);
});

test("the form token must be a real token", () => {
  assert.equal(createToken("6f1d3a2e-4b5c-4d6e-8f70-112233445566"), "6f1d3a2e-4b5c-4d6e-8f70-112233445566");
  assert.equal(createToken("6F1D3A2E-4B5C-4D6E-8F70-112233445566"), "6f1d3a2e-4b5c-4d6e-8f70-112233445566");
  assert.equal(createToken(""), null);
  assert.equal(createToken("not-a-token"), null);
  assert.equal(createToken(null), null);
});

test("the record says plainly when the email did not go, with no dashes", () => {
  assert.equal(riskEmailNotice(null, "Sam"), null);
  for (const code of ["not_configured", "no_recipient", "failed"]) {
    const text = riskEmailNotice(code, "Sam")!;
    assert.match(text, /^Sam has been added/);
    assert.match(text, /Pending risk assessment/);
    assert.doesNotMatch(text, / - | – | — /);
  }
  assert.equal(riskEmailNotice("anything else", "Sam"), null);
});
