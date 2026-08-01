import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Be Care Compliant - inbound SMS, the pure half.
 *
 * Kept out of the route handler on purpose, exactly as lib/export/on-time-cycles.ts is kept out
 * of on-time.ts: signature checking and keyword matching are the two things that decide whether
 * a stranger can write to our database and whether a STOP is honoured, and both must be unit
 * testable without a network, a database or a request.
 */

/** Twilio's standard opt out and help words. */
const STOP_WORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
/**
 * Opt back in.
 *
 * YES IS DELIBERATELY NOT HERE, although Twilio treats it as an opt in word. Our texts go to
 * Managers and Admins about overdue compliance checks, and "YES" is a perfectly ordinary reply to
 * one of those. Swallowing it as a keyword would throw away a real answer to buy an opt in
 * nobody asked for. START and UNSTOP are unambiguous; YES is not.
 */
const START_WORDS = ["START", "UNSTOP"];
const HELP_WORDS = ["HELP", "INFO"];

export type SmsKeyword = "stop" | "start" | "help";

/**
 * The keyword of a message, or null when it is an ordinary reply.
 *
 * WHOLE MESSAGE ONLY. "STOP" opts out; "stop sending these to Dave, he has left" does not, and
 * must not: it is a sentence for a human to read, and treating it as an opt out would silently
 * cut off a number while telling nobody. Punctuation and case are ignored so "Stop." works.
 */
export function parseSmsKeyword(body: string): SmsKeyword | null {
  const word = body.trim().replace(/[.,!?;:'"]+$/g, "").trim().toUpperCase();
  if (!word || word.includes(" ")) return null;
  if (STOP_WORDS.includes(word)) return "stop";
  if (START_WORDS.includes(word)) return "start";
  if (HELP_WORDS.includes(word)) return "help";
  return null;
}

/**
 * The string Twilio signs: the exact URL it was configured with, then every POST parameter
 * sorted by name, each appended as name immediately followed by value with no separator.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function twilioSignatureBase(url: string, params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  return keys.reduce((acc, k) => acc + k + params[k], url);
}

/** The expected X-Twilio-Signature for this URL and body, base64 HMAC SHA1 under the auth token. */
export function computeTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
): string {
  return createHmac("sha1", authToken)
    .update(Buffer.from(twilioSignatureBase(url, params), "utf-8"))
    .digest("base64");
}

/**
 * Is this request really from Twilio?
 *
 * CANDIDATE URLS, not one. Twilio signs the URL exactly as it is typed into the console, and we
 * cannot know whether that was the apex or the www host, so the caller passes every URL this
 * deployment could legitimately be reached on and any one matching is enough. That is not a
 * weakening: an attacker still has to produce a valid HMAC under the auth token.
 *
 * The comparison is timing safe. A byte at a time comparison of an HMAC leaks how much of a
 * guess was right, which is the whole attack on a signature check.
 */
export function verifyTwilioSignature(opts: {
  candidateUrls: string[];
  params: Record<string, string>;
  signature: string | null;
  authToken: string;
}): boolean {
  if (!opts.signature || !opts.authToken) return false;
  // Node's base64 decoder does not throw on rubbish, it returns fewer bytes, so a length check is
  // the guard that matters here.
  const given = Buffer.from(opts.signature, "base64");
  if (given.length === 0) return false;

  return opts.candidateUrls.some((url) => {
    const expected = Buffer.from(
      computeTwilioSignature(url, opts.params, opts.authToken),
      "base64",
    );
    // timingSafeEqual throws on a length mismatch, which is itself a "no".
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

/**
 * Twilio expects TwiML back. An empty Response means "received, say nothing", which is what an
 * ordinary reply gets: the manager is talking to a person, not to a robot, and an automatic
 * answer would only get in the way.
 */
export function twiml(message?: string): string {
  const body = message
    ? `<Message>${message.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}</Message>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

/** What we say back to STOP and HELP. Short: every one of these is a text Phil pays for. */
export const STOP_REPLY =
  "You will get no more texts from Be Care Compliant. Reply START to turn them back on.";
export const START_REPLY =
  "You will get compliance alerts from Be Care Compliant again. Reply STOP to stop.";
export const HELP_REPLY =
  "Be Care Compliant sends overdue compliance alerts. Reply STOP to stop, START to restart. Help: support@becarecompliant.com";
