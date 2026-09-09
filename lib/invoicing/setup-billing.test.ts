import { test } from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files, so the module under test is reached this way. */
import {
  DIRECT_BILLED_FUNDING,
  billsDirectly,
  payerNameFor,
  payerNoteFor,
  payerTypeFor,
} from "./setup-billing.ts";

test("the two funding types we invoice ourselves produce a client", () => {
  assert.equal(billsDirectly("private"), true);
  assert.equal(billsDirectly("nhs_chc"), true);
});

test("a council funded package produces nothing, because the council bills its own way", () => {
  assert.equal(billsDirectly("local_authority"), false);
  assert.equal(billsDirectly("joint_funded"), false);
  assert.equal(billsDirectly("section_117"), false);
});

test("the two Phil was offered and did not take stay out until he says otherwise", () => {
  assert.equal(billsDirectly("la_direct_payment"), false);
  assert.equal(billsDirectly("compensation_or_cop"), false);
});

test("an unanswered or nonsense funding question produces nothing", () => {
  assert.equal(billsDirectly(null), false);
  assert.equal(billsDirectly(undefined), false);
  assert.equal(billsDirectly(""), false);
  assert.equal(billsDirectly(42), false);
  assert.equal(billsDirectly("PRIVATE"), false);
  assert.equal(billsDirectly(["private"]), false);
});

test("a private payer is a person, a health board is an organisation", () => {
  assert.equal(payerTypeFor("private"), "person");
  assert.equal(payerTypeFor("nhs_chc"), "organisation");
});

test("a private client is named for the person paying", () => {
  assert.equal(payerNameFor("private", "Charlie Ashgrove"), "Charlie Ashgrove");
  assert.equal(payerNameFor("private", "  Charlie Ashgrove  "), "Charlie Ashgrove");
});

test("a Continuing Healthcare record says so, because we do not know the health board", () => {
  /* Naming a board we were never told would be a screen stating a fact it does not have. */
  assert.equal(
    payerNameFor("nhs_chc", "Charlie Ashgrove"),
    "Charlie Ashgrove (Continuing Healthcare)",
  );
});

test("a nameless service user still gets a usable record rather than an empty one", () => {
  assert.equal(payerNameFor("private", "   "), "Unnamed service user");
});

test("the note says where the record came from and what is still missing", () => {
  const note = payerNoteFor("private", "2026-09-09");
  assert.match(note, /Setup Visit on 2026-09-09/);
  assert.match(note, /Private \/ self funded/);
  assert.match(note, /still to be filled in/);
  assert.match(payerNoteFor("nhs_chc", "2026-09-09"), /invoice the health board/);
});

test("the rule lives in exactly one list", () => {
  assert.deepEqual([...DIRECT_BILLED_FUNDING], ["private", "nhs_chc"]);
});
