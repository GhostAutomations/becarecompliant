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
  /* A LIST IS NO LONGER NONSENSE (2026-09-17). This line asserted the opposite until the funding
     question became a multi_select, and it is kept rather than deleted because the reason it
     changed is the change: ["private"] is now the ordinary shape of an answer, not a malformed
     one. A list of things that are not funding keys still bills nobody. */
  assert.equal(billedFunding([42, {}], OPTIONS), null);
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

/*
 * MORE THAN ONE FUNDER (Phil, 2026-09-17): "the council me pay for their main serivce but them
 * might add one or tw o private calls or a respite call that the council wont pay for". The
 * answer is a list now. Private sits last in the catalogue because it is the money on top, not
 * the package.
 */
test("a council funded package with private calls on top is still billed", () => {
  // The case that had nowhere to go before: one answer meant one funder, so the private calls
  // either went unrecorded or the whole package was recorded as private.
  assert.equal(billedFunding(["local_authority", "private"], OPTIONS)?.key, "private");
});

test("a list of funders the company does not invoice is not billed", () => {
  const framework = OPTIONS.map((o) => (o.key === "nhs_chc" ? { ...o, billsPrivately: false } : o));
  assert.equal(billedFunding(["local_authority", "nhs_chc"], framework), null);
});

test("the catalogue's order decides, not the order the boxes were ticked", () => {
  /* Otherwise the same package produces two different payer records depending on what somebody
     clicked first. OPTIONS runs local_authority, nhs_chc, private. */
  assert.equal(billedFunding(["private", "nhs_chc"], OPTIONS)?.key, "nhs_chc");
  assert.equal(billedFunding(["nhs_chc", "private"], OPTIONS)?.key, "nhs_chc");
});

test("a single answer still works, because old evidence holds one", () => {
  // Evidence is immutable: a Setup Visit submitted before this change stored a string.
  assert.equal(billedFunding("private", OPTIONS)?.key, "private");
  assert.equal(billedFunding("local_authority", OPTIONS), null);
});

test("an empty list, or nothing at all, is not billed", () => {
  assert.equal(billedFunding([], OPTIONS), null);
  assert.equal(billedFunding(["", null], OPTIONS), null);
  assert.equal(billedFunding(null, OPTIONS), null);
  assert.equal(billedFunding(undefined, OPTIONS), null);
});
