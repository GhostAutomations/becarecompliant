import { test } from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files, so the module under test is reached this way. */
import { billedFunding, payerNameFor, payerNoteFor, type CompanyFunding } from "./setup-billing.ts";

/** A company that takes three funding types and invoices two of them itself. */
const OPTIONS: CompanyFunding[] = [
  { key: "local_authority", label: "Local Authority", payerType: "organisation", billsPrivately: false },
  { key: "nhs_chc", label: "NHS Continuing Healthcare", payerType: "organisation", billsPrivately: true },
  { key: "private", label: "Private / self funded", payerType: "person", billsPrivately: true },
];

test("a funding type the company invoices itself is billed", () => {
  assert.equal(billedFunding("private", OPTIONS)?.key, "private");
  assert.equal(billedFunding("nhs_chc", OPTIONS)?.key, "nhs_chc");
});

test("a council funded package is not, because the council bills its own way", () => {
  assert.equal(billedFunding("local_authority", OPTIONS), null);
});

test("the SAME funding type is billed for one company and not another", () => {
  /* The whole point of moving this out of the code: some agencies bill the health board
     direct for Continuing Healthcare and some are paid through a framework. */
  const framework = OPTIONS.map((o) =>
    o.key === "nhs_chc" ? { ...o, billsPrivately: false } : o,
  );
  assert.equal(billedFunding("nhs_chc", OPTIONS)?.key, "nhs_chc");
  assert.equal(billedFunding("nhs_chc", framework), null);
});

test("an answer the company does not accept at all is not billed", () => {
  assert.equal(billedFunding("section_117", OPTIONS), null);
});

test("an unanswered or nonsense funding question bills nobody", () => {
  assert.equal(billedFunding(null, OPTIONS), null);
  assert.equal(billedFunding(undefined, OPTIONS), null);
  assert.equal(billedFunding("", OPTIONS), null);
  assert.equal(billedFunding(42, OPTIONS), null);
  assert.equal(billedFunding("PRIVATE", OPTIONS), null);
  assert.equal(billedFunding(["private"], OPTIONS), null);
});

test("a company that has ticked nothing bills nobody", () => {
  assert.equal(billedFunding("private", []), null);
  assert.equal(billedFunding("private", OPTIONS.map((o) => ({ ...o, billsPrivately: false }))), null);
});

test("a person payer is named for the person paying", () => {
  const priv = billedFunding("private", OPTIONS)!;
  assert.equal(payerNameFor(priv, "Charlie Ashgrove"), "Charlie Ashgrove");
  assert.equal(payerNameFor(priv, "  Charlie Ashgrove  "), "Charlie Ashgrove");
});

test("an organisation payer is tagged, because we were never told which organisation", () => {
  /* Naming a health board nobody told us would be a screen stating a fact it does not have. */
  const chc = billedFunding("nhs_chc", OPTIONS)!;
  assert.equal(
    payerNameFor(chc, "Charlie Ashgrove"),
    "Charlie Ashgrove (NHS Continuing Healthcare)",
  );
});

test("a nameless service user still gets a usable record rather than an empty one", () => {
  assert.equal(payerNameFor(billedFunding("private", OPTIONS)!, "   "), "Unnamed service user");
});

test("the note says where the record came from and what is still missing", () => {
  const note = payerNoteFor(billedFunding("private", OPTIONS)!, "2026-09-09");
  assert.match(note, /Setup Visit on 2026-09-09/);
  assert.match(note, /Private \/ self funded/);
  assert.match(note, /still to be filled in/);
});
