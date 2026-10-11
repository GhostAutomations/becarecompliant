import { test } from "node:test";
import assert from "node:assert/strict";
import { pathInCompany } from "./company-path.ts";

const A = "1ccab51b-9b68-4190-afc9-b02199a33aaa";
const B = "dd15d6e2-8888-4b2e-8618-6f2a377d9164";

test("a file in the company's own folder passes", () => {
  assert.equal(pathInCompany(`${A}/policies/p1/doc.pdf`, A), true);
  assert.equal(pathInCompany(`${A}/x`, A), true);
});

test("another company's file is refused", () => {
  assert.equal(pathInCompany(`${B}/policies/p1/doc.pdf`, A), false);
  assert.equal(pathInCompany(`${A}x/doc.pdf`, A), false);
  assert.equal(pathInCompany(`x/${A}/doc.pdf`, A), false);
});

test("tricks that leave the folder are refused", () => {
  assert.equal(pathInCompany(`${A}/../${B}/doc.pdf`, A), false);
  assert.equal(pathInCompany(`${A}/a/..`, A), false);
  assert.equal(pathInCompany(`${A}/a\\b.pdf`, A), false);
  assert.equal(pathInCompany(`${A}/`, A), false);
  assert.equal(pathInCompany(`/${A}/doc.pdf`, A), false);
});

test("missing or malformed values are refused", () => {
  assert.equal(pathInCompany(null, A), false);
  assert.equal(pathInCompany(undefined, A), false);
  assert.equal(pathInCompany("pending", A), false);
  assert.equal(pathInCompany(`${A}/doc.pdf`, "not-a-company"), false);
  assert.equal(pathInCompany(`${A}/doc.pdf`, null), false);
});

test("an upper case company id still matches its stored lower case folder", () => {
  assert.equal(pathInCompany(`${A}/doc.pdf`, A.toUpperCase()), true);
});
