import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildComplaintLetterDoc,
  cleanComplaintLetterBody,
  complaintEmailSubject,
  complaintReLine,
  complaintSalutation,
} from "./complaint-letter.ts";

test("the RE line and email subject carry the complaint reference", () => {
  assert.equal(complaintReLine("initial", "CMP-2026-007"), "RE: Your complaint, reference CMP-2026-007");
  assert.equal(complaintReLine("response", "CMP-2026-007"), "RE: Our response to your complaint, reference CMP-2026-007");
  assert.equal(complaintEmailSubject("initial", "CMP-2026-007"), "Your complaint, reference CMP-2026-007");
});

test("Dear uses the name as recorded, or Sir or Madam", () => {
  assert.equal(complaintSalutation("Mrs  Jo Bloggs "), "Dear Mrs Jo Bloggs");
  assert.equal(complaintSalutation(""), "Dear Sir or Madam");
  assert.equal(complaintSalutation(null), "Dear Sir or Madam");
});

test("the AI's own greeting and sign off are taken out, dates and dashes tidied", () => {
  const raw =
    "Dear Mrs Bloggs,\n\nThank you for contacting us on 01/10/2026 — we have received your complaint.\n\n" +
    "We will reply by 3 October 2026.\n\nYours sincerely,\n\nThe team";
  assert.equal(
    cleanComplaintLetterBody(raw, "Mrs Jo Bloggs"),
    "<p>Thank you for contacting us on 1st October 2026, we have received your complaint.</p><p>We will reply by 3rd October 2026.</p>",
  );
});

test("the letter is laid out with the complainant, the reference and the sender", () => {
  const doc = buildComplaintLetterDoc({
    kind: "initial",
    ref: "CMP-1",
    companyName: "Example Care Ltd",
    letterheadAddress: "1 High Street, Town, AB1 2CD",
    letterheadPhone: "01234 567890",
    letterDateIso: "2026-10-12",
    recipientName: "Mrs Jo Bloggs",
    recipientAddress: "2 Low Road\nTown",
    bodyHtml: "<p>Thank you.</p>",
    signer: { name: "Sam Idris", role: "Registered Manager" },
  });
  assert.deepEqual(doc.recipientLines, ["Mrs Jo Bloggs", "2 Low Road", "Town"]);
  assert.equal(doc.salutation, "Dear Mrs Jo Bloggs");
  assert.equal(doc.reLine, "RE: Your complaint, reference CMP-1");
  assert.equal(doc.date, "12th October 2026");
  assert.deepEqual(doc.signOff, { closing: "Yours sincerely", name: "Sam Idris", role: "Registered Manager" });
  assert.deepEqual(doc.phoneLines, ["Tel: 01234 567890"]);
});
