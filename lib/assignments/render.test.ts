import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED, and the module under test imports only `removeField`, so this file
 *  pulls lib/form-schema.ts in too. Both are isomorphic with no side effects. */
import { briefingRenderSchema, identityKind, seedIdentityAnswers } from "./render.ts";

const HOLIDAY = {
  schemaVersion: 1,
  sections: [
    {
      id: "s1",
      title: "Details",
      fields: [
        { key: "name", type: "short_text", label: "Name" },
        { key: "what_area_do_you_work_for", type: "single_select", label: "What area do you work for?",
          options: [{ value: "newport", label: "Newport" }, { value: "cardiff", label: "Cardiff" }] },
        { key: "start_date_of_holiday", type: "date", label: "Start date of holiday?", required: true },
        { key: "end_date_of_holiday", type: "date", label: "End date of holiday?", required: true },
        { key: "please_enter_your_email_address", type: "short_text", label: "Please enter your email address." },
      ],
    },
  ],
} as never;

function keys(schema: never): string[] {
  return (schema as { sections: { fields: { key: string }[] }[] }).sections.flatMap((s) =>
    s.fields.map((f) => f.key),
  );
}

test("a logged in carer is not asked their own name, email or area", () => {
  assert.deepEqual(keys(briefingRenderSchema(HOLIDAY) as never), [
    "start_date_of_holiday",
    "end_date_of_holiday",
  ]);
});

test("a REQUIRED identity question is never dropped", () => {
  const schema = {
    schemaVersion: 1,
    sections: [{ id: "a", title: "A", fields: [{ key: "name", type: "short_text", label: "Name", required: true }] }],
  } as never;
  assert.deepEqual(keys(briefingRenderSchema(schema) as never), ["name"]);
});

test("identityKind is TIGHT: it never eats a real question about somebody else", () => {
  // These would blank a genuine answer on a supervision or a spot check.
  assert.equal(identityKind("manager_conducting", "Manager Conducting Meeting"), null);
  assert.equal(identityKind("name_of_service_user", "Name of the person you supported"), null);
  assert.equal(identityKind("carer_name", "Carer name"), null);
  assert.equal(identityKind("witness_name", "Name of witness"), null);
});

test("identityKind catches the ones it should", () => {
  assert.equal(identityKind("name", "Name"), "name");
  assert.equal(identityKind("full_name", "Your full name"), "name");
  assert.equal(identityKind("please_enter_your_email_address", "Please enter your email address."), "email");
  assert.equal(identityKind("what_area_do_you_work_for", "What area do you work for?"), "branch");
  assert.equal(identityKind("branch", "Branch"), "branch");
});

test("name and email are seeded back so the Evidence still names the person", () => {
  const got = seedIdentityAnswers(HOLIDAY, { start_date_of_holiday: "2026-09-07" }, {
    fullName: "Charlotte test",
    email: "wakeling13@icloud.com",
  });
  assert.equal(got.name, "Charlotte test");
  assert.equal(got.please_enter_your_email_address, "wakeling13@icloud.com");
  assert.equal(got.start_date_of_holiday, "2026-09-07");
});

test("BRANCH is never seeded, because the option list need not match the branch names", () => {
  // The live form offers "newport"/"cardiff" while the carer's branch is "Newport1". Writing the
  // real branch in would be an option that does not exist and validation refuses those outright.
  const got = seedIdentityAnswers(HOLIDAY, {}, { fullName: "Charlotte test", email: "c@x.com" });
  assert.equal("what_area_do_you_work_for" in got, false);
});

test("an answer somebody actually gave is never overwritten", () => {
  const got = seedIdentityAnswers(HOLIDAY, { name: "Charlie" }, { fullName: "Charlotte test", email: null });
  assert.equal(got.name, "Charlie");
});

test("a missing record detail leaves the question unanswered rather than writing empty", () => {
  const got = seedIdentityAnswers(HOLIDAY, {}, { fullName: null, email: null });
  assert.equal("name" in got, false);
  assert.equal("please_enter_your_email_address" in got, false);
});
