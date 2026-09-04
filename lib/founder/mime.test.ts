import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED. */
import { headerBlock, headerFromRaw, decodeEncodedWords, fromHeaderOf } from "./mime.ts";

const RAW = [
  "Received: from mail.outlook.com by inbound-smtp.eu-west-1.amazonaws.com",
  "Content-Type: text/plain; charset=UTF-8",
  "From: Phil Davies <phil.davies@outlook.com>",
  "To: hello@becarecompliant.com",
  "Subject: Test email",
  "",
  "Sent from my iPhone",
].join("\r\n");

test("the header block stops at the blank line", () => {
  assert.ok(headerBlock(RAW).includes("Subject: Test email"));
  assert.ok(!headerBlock(RAW).includes("Sent from my iPhone"));
});

test("THE WHOLE POINT: the sender's name comes out of the raw message", () => {
  assert.equal(fromHeaderOf(RAW), "Phil Davies <phil.davies@outlook.com>");
});

test("header names are matched without regard to case", () => {
  const raw = "FROM: Ade Odumosu <admin@clareege-care.co.uk>\r\n\r\nbody";
  assert.equal(fromHeaderOf(raw), "Ade Odumosu <admin@clareege-care.co.uk>");
});

test("a folded header is put back together", () => {
  const raw = [
    'From: "Odumosu, Ade"',
    " <admin@clareege-care.co.uk>",
    "Subject: Trial",
    "",
    "body",
  ].join("\r\n");
  assert.equal(fromHeaderOf(raw), '"Odumosu, Ade" <admin@clareege-care.co.uk>');
});

test("the FIRST From wins, because a second one is a forgery trick", () => {
  const raw = [
    "From: Real Sender <real@example.co.uk>",
    "From: Someone Else <spoof@elsewhere.com>",
    "",
    "body",
  ].join("\r\n");
  assert.equal(fromHeaderOf(raw), "Real Sender <real@example.co.uk>");
});

test("an accented name arrives as itself, not as =?UTF-8?B?…?=", () => {
  const encoded = `=?UTF-8?B?${Buffer.from("Seán Ó Braonáin").toString("base64")}?=`;
  assert.equal(decodeEncodedWords(encoded), "Seán Ó Braonáin");
  const raw = `From: ${encoded} <sean@example.ie>\r\n\r\nbody`;
  assert.equal(fromHeaderOf(raw), "Seán Ó Braonáin <sean@example.ie>");
});

test("Q encoded names decode too, underscores being spaces", () => {
  assert.equal(decodeEncodedWords("=?UTF-8?Q?Phil_Davies?="), "Phil Davies");
  assert.equal(decodeEncodedWords("=?UTF-8?Q?Se=C3=A1n?="), "Seán");
});

test("SOMETHING IT CANNOT DECODE IS LEFT ALONE, never replaced with an error", () => {
  const broken = "=?UTF-8?B?!!!not-base64!!!?=";
  assert.equal(decodeEncodedWords(broken), broken);
});

test("no From header is null, not a crash and not an empty name", () => {
  assert.equal(fromHeaderOf("Subject: nothing\r\n\r\nbody"), null);
  assert.equal(fromHeaderOf(""), null);
  assert.equal(headerFromRaw("From:   \r\n\r\nbody", "from"), null);
});

test("a header with no colon does not derail the search", () => {
  const raw = ["this line is nonsense", "From: A B <a@b.co>", "", "body"].join("\r\n");
  assert.equal(fromHeaderOf(raw), "A B <a@b.co>");
});
