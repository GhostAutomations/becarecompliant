import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED. */
import {
  normaliseAddress,
  parseFrom,
  domainOf,
  matchLead,
  replySubject,
  buildReferences,
  previewOf,
  withoutQuotedReply,
  isOurAddress,
  looksAutomated,
  listPreview,
} from "./inbox.ts";

test("an address is compared lowercased and trimmed", () => {
  assert.equal(normaliseAddress("  Info@LivityCare.co.UK "), "info@livitycare.co.uk");
  assert.equal(normaliseAddress(null), "");
});

test("a From header splits into a name and an address", () => {
  assert.deepEqual(parseFrom("Sean Kuuya <info@livitycare.co.uk>"), {
    name: "Sean Kuuya",
    address: "info@livitycare.co.uk",
  });
  assert.deepEqual(parseFrom('"Odumosu, Ade" <admin@clareege-care.co.uk>'), {
    name: "Odumosu, Ade",
    address: "admin@clareege-care.co.uk",
  });
  assert.deepEqual(parseFrom("info@livitycare.co.uk"), {
    name: null,
    address: "info@livitycare.co.uk",
  });
  assert.deepEqual(parseFrom(null), { name: null, address: "" });
});

test("the domain is the part after the LAST @, so a quoted local part cannot fool it", () => {
  assert.equal(domainOf("info@livitycare.co.uk"), "livitycare.co.uk");
  assert.equal(domainOf('"a@b"@example.com'), "example.com");
  assert.equal(domainOf("not-an-address"), "");
});

const LEADS = [
  { id: "old", email: "info@livitycare.co.uk", created_at: "2026-08-27T08:21:53Z" },
  { id: "new", email: "info@livitycare.co.uk", created_at: "2026-08-27T08:25:10Z" },
  { id: "ade", email: "admin@clareege-care.co.uk", created_at: "2026-08-27T01:16:30Z" },
];

test("a reply is filed against the lead that used that exact address", () => {
  assert.equal(matchLead("admin@clareege-care.co.uk", LEADS), "ade");
});

test("when one address asked twice, the most recent request wins", () => {
  // Sean submitted twice, four minutes apart. His reply belongs to the live conversation.
  assert.equal(matchLead("info@livitycare.co.uk", LEADS), "new");
  assert.equal(matchLead("  INFO@LivityCare.co.uk ", LEADS), "new");
});

test("THE ONE THAT MATTERS: a colleague at the same domain is NOT filed against the lead", () => {
  // A domain match would be right most of the time and badly wrong occasionally — shared
  // mailboxes, agencies, a competitor at the same host. Unmatched is an annoyance; misfiled is
  // a data protection problem.
  assert.equal(matchLead("someone.else@livitycare.co.uk", LEADS), null);
  assert.equal(matchLead("", LEADS), null);
  assert.equal(matchLead("info@livitycare.co.uk", []), null);
});

test("a reply says Re: once, however the original was capitalised", () => {
  assert.equal(replySubject("Your trial request"), "Re: Your trial request");
  assert.equal(replySubject("Re: Your trial request"), "Re: Your trial request");
  assert.equal(replySubject("RE: Your trial request"), "RE: Your trial request");
  assert.equal(replySubject("re:Your trial request"), "re:Your trial request");
  assert.equal(replySubject(""), "Re: (no subject)");
  assert.equal(replySubject(null), "Re: (no subject)");
});

test("References accumulates the thread, oldest first, with no duplicates", () => {
  assert.equal(buildReferences(null, "<a@mail>"), "<a@mail>");
  assert.equal(buildReferences("<a@mail>", "<b@mail>"), "<a@mail> <b@mail>");
  // A client that echoes the id back must not double it, because a malformed References
  // header breaks threading in Outlook.
  assert.equal(buildReferences("<a@mail> <b@mail>", "<b@mail>"), "<a@mail> <b@mail>");
  assert.equal(buildReferences("", null), null);
});

test("the preview is one line and never runs on", () => {
  assert.equal(previewOf("Hi Phil,\n\nThanks for  that."), "Hi Phil, Thanks for that.");
  assert.equal(previewOf(""), "No text content");
  assert.equal(previewOf(null), "No text content");
  const long = "x".repeat(200);
  const cut = previewOf(long, 20);
  assert.equal(cut.length, 20);
  assert.ok(cut.endsWith("…"));
});

test("quoted history is dropped from the preview, not from the record", () => {
  const body = [
    "Yes, Friday works.",
    "",
    "On Thu, 3 Sep 2026 at 12:15, Phil Davies wrote:",
    "> Would Friday suit?",
  ].join("\n");
  assert.equal(withoutQuotedReply(body), "Yes, Friday works.");

  const outlookStyle = ["Sounds good.", "-----Original Message-----", "From: Phil"].join("\n");
  assert.equal(withoutQuotedReply(outlookStyle), "Sounds good.");

  // A message with no quoting is returned whole.
  assert.equal(withoutQuotedReply("Just this."), "Just this.");
});

test("our own addresses are recognised, including on a sending subdomain", () => {
  const ours = ["becarecompliant.com"];
  assert.equal(isOurAddress("hello@becarecompliant.com", ours), true);
  assert.equal(isOurAddress("no-reply@mail.becarecompliant.com", ours), true);
  assert.equal(isOurAddress("info@livitycare.co.uk", ours), false);
  // A lookalike domain must not pass as ours.
  assert.equal(isOurAddress("hello@notbecarecompliant.com", ours), false);
});

test("bounces and out-of-office do not look like a customer waiting", () => {
  assert.equal(looksAutomated("mailer-daemon@outlook.com", "Undeliverable: Your trial"), true);
  assert.equal(looksAutomated("someone@care.co.uk", "Automatic reply: Out of the office"), true);
  assert.equal(looksAutomated("postmaster@x.com", null), true);
  assert.equal(looksAutomated("no-reply@x.com", "anything"), true);
  assert.equal(looksAutomated("info@livitycare.co.uk", "Re: Your trial request"), false);
});

test("THE LIST NEVER CALLS A FAILED FETCH AN EMPTY EMAIL", () => {
  // This is the wording that made Phil apologise for a defect that was not his:
  // a refused fetch read as "No text content", exactly like a blank message.
  assert.equal(
    listPreview({ body_text: null, body_error: "restricted_api_key", send_error: null }),
    "Content not collected yet",
  );
  // A genuinely blank message says so, and says something different.
  assert.equal(
    listPreview({ body_text: null, body_error: null, send_error: null }),
    "No message text",
  );
  // Whitespace is not content.
  assert.equal(
    listPreview({ body_text: "   \n  ", body_error: null, send_error: null }),
    "No message text",
  );
});

test("a failed send outranks everything else in the list", () => {
  assert.equal(
    listPreview({ body_text: "Hello there", body_error: null, send_error: "Resend 422" }),
    "Did not send",
  );
});

test("the preview is the message, without the part it is quoting", () => {
  const body = "Yes, Friday works.\n\nOn Thu, Phil Davies wrote:\n> Would Friday suit?";
  assert.equal(
    listPreview({ body_text: body, body_error: null, send_error: null }),
    "Yes, Friday works.",
  );
});
