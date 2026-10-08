import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. */
import { signatureGiven, SIGNATURE_MODE_LABELS, SIGNATURE_MODES } from "./signature-rules.ts";

const png = "data:image/png;base64,AAAA";

test("draw and type needs the drawing and the typed name", () => {
  assert.equal(signatureGiven({}, "both").ok, false);
  assert.equal(signatureGiven({ signature: png }, "both").ok, false);
  assert.equal(signatureGiven({ signature_typed: "Jane Smith" }, "both").ok, false);
  assert.equal(signatureGiven({ signature: png, signature_typed: "Jo" }, "both").ok, false);
  assert.equal(signatureGiven({ signature: png, signature_typed: "Jane Smith" }, "both").ok, true);
});

test("draw and type says which half is missing", () => {
  const r = signatureGiven({ signature: png }, "both");
  assert.match(r.ok ? "" : r.error, /type your full name/i);
  const s = signatureGiven({ signature_typed: "Jane Smith" }, "both");
  assert.match(s.ok ? "" : s.error, /sign in the box/i);
});

test("draw and type is offered wherever signing is set", () => {
  assert.ok(SIGNATURE_MODES.includes("both"));
  assert.equal(SIGNATURE_MODE_LABELS.both, "Draw and type, both needed");
});

test("the other signing modes are unchanged", () => {
  assert.equal(signatureGiven({ signature: png }, "either").ok, true);
  assert.equal(signatureGiven({ signature_typed: "Jane Smith" }, "either").ok, true);
  assert.equal(signatureGiven({ signature: png }, "type").ok, false);
  assert.equal(signatureGiven({ signature_typed: "Jane Smith" }, "draw").ok, false);
});
