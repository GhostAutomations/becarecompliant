import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  parseSmsKeyword,
  twilioSignatureBase,
  computeTwilioSignature,
  verifyTwilioSignature,
  twiml,
} from "./inbound.ts";

const TOKEN = "test_auth_token_do_not_use";
const URL_A = "https://www.becarecompliant.com/api/webhooks/twilio/sms";
const URL_B = "https://becarecompliant.com/api/webhooks/twilio/sms";

const params = {
  MessageSid: "SM123",
  From: "+447700900123",
  To: "+447700900999",
  Body: "STOP",
};

test("keywords are matched whole, ignoring case and trailing punctuation", () => {
  assert.equal(parseSmsKeyword("STOP"), "stop");
  assert.equal(parseSmsKeyword(" stop "), "stop");
  assert.equal(parseSmsKeyword("Stop."), "stop");
  assert.equal(parseSmsKeyword("UNSUBSCRIBE"), "stop");
  assert.equal(parseSmsKeyword("start"), "start");
  assert.equal(parseSmsKeyword("HELP"), "help");
});

test("a sentence containing stop is a message for a human, not an opt out", () => {
  // Cutting a number off on this would silence somebody and tell nobody.
  assert.equal(parseSmsKeyword("stop sending these to Dave, he has left"), null);
  assert.equal(parseSmsKeyword("Please stop"), null);
  assert.equal(parseSmsKeyword(""), null);
});

test("YES is a real reply, not an opt in keyword", () => {
  // Twilio treats YES as an opt in word. We do not: our texts ask about overdue checks and YES
  // is an ordinary answer to one.
  assert.equal(parseSmsKeyword("YES"), null);
});

test("the signature base is the url then every parameter sorted by name", () => {
  const base = twilioSignatureBase("https://x.test/hook", { b: "2", a: "1", c: "3" });
  assert.equal(base, "https://x.test/hooka1b2c3");
});

test("a signature Twilio would send verifies", () => {
  const signature = computeTwilioSignature(URL_A, params, TOKEN);
  assert.equal(
    verifyTwilioSignature({ candidateUrls: [URL_A], params, signature, authToken: TOKEN }),
    true,
  );
});

test("either host verifies, because Twilio signs the url it was configured with", () => {
  const signature = computeTwilioSignature(URL_B, params, TOKEN);
  assert.equal(
    verifyTwilioSignature({
      candidateUrls: [URL_A, URL_B],
      params,
      signature,
      authToken: TOKEN,
    }),
    true,
  );
});

test("a wrong token, a changed body, a missing signature and junk are all refused", () => {
  const good = computeTwilioSignature(URL_A, params, TOKEN);

  assert.equal(
    verifyTwilioSignature({
      candidateUrls: [URL_A],
      params,
      signature: good,
      authToken: "someone_elses_token",
    }),
    false,
  );

  // The body is signed, so tampering with it after the fact fails.
  assert.equal(
    verifyTwilioSignature({
      candidateUrls: [URL_A],
      params: { ...params, Body: "START" },
      signature: good,
      authToken: TOKEN,
    }),
    false,
  );

  assert.equal(
    verifyTwilioSignature({ candidateUrls: [URL_A], params, signature: null, authToken: TOKEN }),
    false,
  );

  assert.equal(
    verifyTwilioSignature({ candidateUrls: [URL_A], params, signature: "", authToken: TOKEN }),
    false,
  );

  // A signature of the right shape but the wrong value.
  const wrong = createHmac("sha1", TOKEN).update("nonsense").digest("base64");
  assert.equal(
    verifyTwilioSignature({ candidateUrls: [URL_A], params, signature: wrong, authToken: TOKEN }),
    false,
  );
});

test("an unconfigured deployment verifies nothing", () => {
  const signature = computeTwilioSignature(URL_A, params, TOKEN);
  assert.equal(
    verifyTwilioSignature({ candidateUrls: [URL_A], params, signature, authToken: "" }),
    false,
  );
});

test("twiml is well formed and escapes what it is given", () => {
  assert.equal(twiml(), '<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  assert.match(twiml("Hello"), /<Message>Hello<\/Message>/);
  assert.match(twiml("a & b <c>"), /<Message>a &amp; b &lt;c&gt;<\/Message>/);
});
