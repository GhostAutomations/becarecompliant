import { test } from "node:test";
import assert from "node:assert/strict";
import { trialRequestInboxMessage, trialRequestSmsText } from "./trial-inbox.ts";

const base = {
  company_name: "Smith & Sons Care",
  contact_name: "Jo O'Brien",
  email: "jo@example.com",
  phone: null,
  tier_interest: "pro",
  team_size: "25",
  message: "Two services\n<script>alert(1)</script>",
};

test("the subject names the company and the body carries every detail", () => {
  const m = trialRequestInboxMessage(base);
  assert.equal(m.subject, "Trial request: Smith & Sons Care");
  assert.match(m.text, /Contact: Jo O'Brien/);
  assert.match(m.text, /Phone: Not given/);
  assert.match(m.text, /Interested in: Pro/);
  assert.match(m.text, /Team size: 25/);
});

test("what the applicant typed is escaped in the HTML", () => {
  const m = trialRequestInboxMessage(base);
  assert.doesNotMatch(m.html, /<script>/);
  assert.match(m.html, /Smith &amp; Sons Care/);
  assert.match(m.html, /O&#39;Brien/);
});

test("no plan chosen reads Not sure yet", () => {
  assert.match(trialRequestInboxMessage({ ...base, tier_interest: null }).text, /Interested in: Not sure yet/);
});

test("the billing choice is shown, and a blank one reads Not sure yet", () => {
  assert.match(trialRequestInboxMessage({ ...base, billing_interest: "annual" }).text, /Would pay: Annual/);
  assert.match(trialRequestInboxMessage(base).text, /Would pay: Not sure yet/);
});

test("the founder text names the lead, the plan and the billing choice, with no dashes", () => {
  const t = trialRequestSmsText({ ...base, billing_interest: "monthly" });
  assert.equal(t, "Be Care Compliant: trial request from Smith & Sons Care (Jo O'Brien). Pro, monthly. See the Founder inbox.");
  assert.doesNotMatch(t, /[\u2013\u2014]| - /);
  const long = trialRequestSmsText({ ...base, company_name: "A".repeat(80), contact_name: "B".repeat(80), tier_interest: null });
  assert.ok(long.length <= 160, `too long: ${long.length}`);
  assert.match(long, /No plan, no billing choice/);
  assert.match(long, /^[\x20-\x7E]*$/, "only plain characters, so it stays one SMS");
});
