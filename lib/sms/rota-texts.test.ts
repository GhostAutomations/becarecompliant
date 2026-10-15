import { test } from "node:test";
import assert from "node:assert/strict";
import { rotaChangedText, rotaOfferText, rotaPublishedText, smsLinkText } from "./texts.ts";
import { SMS_GSM_LIMIT } from "./segments.ts";

const link = smsLinkText("ab12cd34");

test("rota texts are one SMS with ordinary names", () => {
  for (const t of [
    rotaPublishedText({ firstName: "Sam", companyName: "Bevan Care Ltd", weekLabel: "2 Nov", link }),
    rotaChangedText({ firstName: "Sam", companyName: "Bevan Care Ltd", link }),
    rotaOfferText({ firstName: "Sam", companyName: "Bevan Care Ltd", when: "Mon 2 Nov, 08:00 to 14:00", link }),
  ]) {
    assert.ok(t.ok, JSON.stringify(t));
    assert.ok(t.length <= SMS_GSM_LIMIT);
    assert.ok(t.ok && t.text.includes(link), "the link is never cut");
  }
});

test("a very long company and first name are shortened, never the link, and it stays one SMS", () => {
  const t = rotaOfferText({
    firstName: "Maximiliana Alexandrina",
    companyName: "The Very Long Named Domiciliary Care and Support Services Company of South West Wales Limited",
    when: "Mon 2 Nov, 08:00 to 14:00",
    link,
  });
  assert.ok(t.ok, JSON.stringify(t));
  assert.ok(t.ok && t.text.endsWith(link));
  assert.ok(t.length <= SMS_GSM_LIMIT);
});

test("no dashes as punctuation in the rota texts", () => {
  const t = rotaPublishedText({ firstName: "Sam", companyName: "Bevan Care Ltd", weekLabel: "2 Nov", link });
  assert.ok(t.ok && !/ [-–—] /.test(t.text));
});
