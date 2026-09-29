import { test } from "node:test";
import assert from "node:assert/strict";
import { inertEmailHtml, notSentReason, type LetterPreview } from "./letter-preview.ts";

const base: LetterPreview = {
  key: "employee",
  who: "Employee",
  name: "Jane Smith",
  to: "jane@example.com",
  subject: "Stage 1",
  html: "<p>x</p>",
  note: null,
};

test("inertEmailHtml adds a base target straight after the head tag", () => {
  assert.equal(
    inertEmailHtml('<html lang="en"><head><meta charset="utf-8"></head><body></body></html>'),
    '<html lang="en"><head><base target="_blank"><meta charset="utf-8"></head><body></body></html>',
  );
});

test("inertEmailHtml keeps attributes on the head tag", () => {
  assert.equal(inertEmailHtml('<head class="a"></head>'), '<head class="a"><base target="_blank"></head>');
});

test("inertEmailHtml prefixes when there is no head", () => {
  assert.equal(inertEmailHtml("<p>x</p>"), '<base target="_blank"><p>x</p>');
});

test("notSentReason is null when there is an address", () => {
  assert.equal(notSentReason(base), null);
});

test("notSentReason names the employee and says where to fix it", () => {
  assert.match(notSentReason({ ...base, to: null }) ?? "", /Manage record/);
});

test("notSentReason words the conductor case on its own", () => {
  assert.equal(
    notSentReason({ ...base, key: "conductor", name: "Phil", to: null }),
    "Phil has no email address, so this letter will not be sent.",
  );
});

test("notSentReason prefers the letter's own note when it has one", () => {
  assert.equal(notSentReason({ ...base, to: null, unsentNote: "Kept as a PDF." }), "Kept as a PDF.");
});
