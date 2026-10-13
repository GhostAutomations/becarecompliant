import test from "node:test";
import assert from "node:assert/strict";

import { fromAddress, fromWithName } from "./from-name.ts";

test("the address is taken from either form of the From", () => {
  assert.equal(fromAddress("Be Care Compliant <noreply@example.com>"), "noreply@example.com");
  assert.equal(fromAddress("noreply@example.com"), "noreply@example.com");
});

test("the company's name on our sending address", () => {
  assert.equal(fromWithName("Example Care Ltd", "Be Care Compliant <noreply@example.com>"), '"Example Care Ltd" <noreply@example.com>');
  assert.equal(fromWithName("St. Anne's Care, Ltd", "noreply@example.com"), '"St. Anne\'s Care, Ltd" <noreply@example.com>');
});

test("nothing in the name can break the header", () => {
  assert.equal(fromWithName('Bad "Name" <x@y>\r\nBcc: z@z', "noreply@example.com"), '"Bad Name x@y Bcc: z@z" <noreply@example.com>');
});

test("no usable name keeps the original From", () => {
  assert.equal(fromWithName("", "Be Care Compliant <noreply@example.com>"), "Be Care Compliant <noreply@example.com>");
  assert.equal(fromWithName(null, "noreply@example.com"), "noreply@example.com");
  assert.equal(fromWithName("   ", "noreply@example.com"), "noreply@example.com");
});
