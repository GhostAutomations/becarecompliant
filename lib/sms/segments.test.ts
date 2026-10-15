import { test } from "node:test";
import assert from "node:assert/strict";
import { fitSms, isGsm7, oneSms, smsLength, smsSegments, toGsm7 } from "./segments.ts";
import { overdueChaserText, rtwQuestionsText, smsLinkText, ticketText, trialRequestText } from "./texts.ts";

const LINK = smsLinkText("ab3defgh");

test("GSM 7 or not: a curly quote, an emoji or many accents switch a text to 70 characters", () => {
  assert.equal(isGsm7("Hi Sam, answer here."), true);
  assert.equal(isGsm7("O’Brien"), false);
  assert.equal(isGsm7("Hi 😀"), false);
  assert.equal(isGsm7("Zoë"), false); // ë is not in GSM 7
  assert.equal(isGsm7("José"), true); // é is
  assert.equal(smsSegments("a".repeat(70) + "’"), 2);
  assert.equal(smsSegments("a".repeat(160)), 1);
  assert.equal(smsSegments("a".repeat(161)), 2);
});

test("toGsm7 folds what it can and removes what it cannot", () => {
  assert.equal(toGsm7("O’Brien’s “form” – today…"), "O'Brien's \"form\" - today...");
  assert.equal(toGsm7("Zoë Łukasz Ç"), "Zoe ukasz Ç");
  assert.equal(toGsm7("Sam 😀 Jones"), "Sam Jones");
  assert.equal(isGsm7(toGsm7("Ångström façade naïve 李")), true);
});

test("extension characters count twice", () => {
  assert.equal(smsLength("[a]"), 5);
  assert.equal(smsLength("€1"), 3);
});

test("oneSms refuses anything over one SMS and never sends two", () => {
  assert.equal(oneSms("a".repeat(160)).ok, true);
  const over = oneSms("a".repeat(161));
  assert.equal(over.ok, false);
  assert.match((over as { error: string }).error, /161 characters/);
  assert.equal(oneSms("   ").ok, false);
});

test("the Return to Work text is one SMS, with the link whole, at the longest names", () => {
  const r = rtwQuestionsText({ firstName: "Alexandrina", companyName: "Demo Care Company Limited", link: LINK });
  assert.equal(r.ok, true);
  assert.ok((r as { text: string }).text.endsWith(LINK));
  assert.ok(r.length <= 160);
});

test("a very long company name is shortened first, then the first name, never the link", () => {
  const r = rtwQuestionsText({
    firstName: "Bartholomew-Alexander",
    companyName: "The Very Long Named Domiciliary Care and Support Services Partnership of South Wales Limited",
    link: LINK,
  });
  assert.equal(r.ok, true);
  const text = (r as { text: string }).text;
  assert.ok(text.endsWith(LINK));
  assert.ok(r.length <= 160);
  assert.match(text, /^Hi Bartholomew-Alexander, The Very Long Named/);
});

test("names with accents and an emoji still make one plain SMS", () => {
  const r = rtwQuestionsText({ firstName: "Zoë 😀", companyName: "Gofal Cymraeg Cyf", link: LINK });
  assert.equal(r.ok, true);
  assert.equal(isGsm7((r as { text: string }).text), true);
  assert.match((r as { text: string }).text, /^Hi Zoe, Gofal Cymraeg Cyf has/);
});

test("the overdue chaser reads well for one and for many", () => {
  const one = overdueChaserText({ companyName: "Thistle Care Ltd", count: 1, days: 7 });
  assert.equal((one as { text: string }).text, "Thistle Care Ltd: 1 check is 7 or more days overdue. Sign in to review: becarecompliant.com");
  const many = overdueChaserText({ companyName: "Demo Care Company Limited", count: 12, days: 14 });
  assert.equal(many.ok, true);
  assert.ok(many.length <= 160);
});

test("the ticket text cuts the subject to fit, with no link", () => {
  const r = ticketText({ number: 123, rating: "Red", companyName: "Demo Care Company Limited", subject: "x".repeat(300) });
  assert.equal(r.ok, true);
  assert.match((r as { text: string }).text, /^Ticket 123 Red from Demo Care Company Limited: x+\.$/);
  assert.ok(r.length <= 160);
  assert.equal(
    (ticketText({ number: 7, rating: "Amber", companyName: "Thistle Care Ltd", subject: "Planner not loading." }) as { text: string }).text,
    "Ticket 7 Amber from Thistle Care Ltd: Planner not loading.",
  );
});

test("the trial request text fits", () => {
  const r = trialRequestText({ companyName: "A".repeat(90), contactName: "B".repeat(60), plan: "Black", billing: "monthly" });
  assert.equal(r.ok, true);
  assert.ok(r.length <= 160);
});

test("fitSms refuses when the fixed words alone are too long", () => {
  const r = fitSms(() => "z".repeat(170), [{ key: "a", value: "x", min: 1 }]);
  assert.equal(r.ok, false);
});

test("no dashes as punctuation in any text", () => {
  for (const r of [
    rtwQuestionsText({ firstName: "Sam", companyName: "Thistle Care Ltd", link: LINK }),
    overdueChaserText({ companyName: "Thistle Care Ltd", count: 3, days: 7 }),
    ticketText({ number: 5, rating: "Amber", companyName: "Thistle Care Ltd", subject: "Planner" }),
  ]) {
    assert.doesNotMatch((r as { text: string }).text, / - /);
  }
});
