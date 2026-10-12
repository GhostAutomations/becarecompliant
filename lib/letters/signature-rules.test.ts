import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mayKeepLetterSignature,
  parseSignatureChoice,
  pngDataUrlBase64,
  sniffSignatureImage,
} from "./signature-rules.ts";

test("the six office roles can keep a signature, nobody else", () => {
  for (const role of ["company_admin", "registered_individual", "registered_manager", "manager", "supervisor", "recruiter"]) {
    assert.equal(mayKeepLetterSignature({ role, status: "active" }), true, role);
  }
  for (const role of ["on_call", "team_member", "staff", "senior", "platform_admin", "", null]) {
    assert.equal(mayKeepLetterSignature({ role, status: "active" }), false, String(role));
  }
});

test("never the Founder in support mode, never a disabled login", () => {
  assert.equal(mayKeepLetterSignature({ role: "company_admin", actingAsCompanyId: "c1" }), false);
  assert.equal(mayKeepLetterSignature({ role: "manager", status: "disabled" }), false);
});

test("the signing choice: anything unknown is no signature", () => {
  assert.equal(parseSignatureChoice("upload"), "upload");
  assert.equal(parseSignatureChoice("drawn"), "drawn");
  assert.equal(parseSignatureChoice("now"), "now");
  assert.equal(parseSignatureChoice("typed"), "none");
  assert.equal(parseSignatureChoice(null), "none");
});

test("PNG and JPEG are told apart by their first bytes, anything else refused", () => {
  assert.equal(sniffSignatureImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
  assert.equal(sniffSignatureImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffSignatureImage(new Uint8Array([0x3c, 0x73, 0x76, 0x67])), null); // <svg
  assert.equal(sniffSignatureImage(new Uint8Array([])), null);
});

test("only a PNG data URL counts as a signature drawn now", () => {
  assert.equal(pngDataUrlBase64("data:image/png;base64,iVBORw0KGgo="), "iVBORw0KGgo=");
  assert.equal(pngDataUrlBase64("data:image/svg+xml;base64,PHN2Zz4="), null);
  assert.equal(pngDataUrlBase64(""), null);
});
