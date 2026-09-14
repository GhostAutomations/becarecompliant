import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  BAKED_OPTION_FIELD_KEYS,
  OWNED_SECTION_ID,
  fingerprintSchema,
  isPushable,
  pushStateFor,
  schemaToPush,
} from "./library-sync.ts";
import type { FormSchema } from "../form-schema.ts";

function schema(fields: Array<Record<string, unknown>>): FormSchema {
  return {
    schemaVersion: 1,
    sections: [{ id: "s1", title: "Details", fields: fields as never }],
  } as FormSchema;
}

const LIBRARY = schema([
  { key: "service_user_name", type: "short_text", label: "Service User Name", required: true },
  {
    key: "region",
    type: "single_select",
    label: "Branch",
    options: [{ label: "Cardiff", value: "Cardiff" }],
  },
]);

describe("comparing a company's form against the library", () => {
  it("ignores the option lists the system bakes per company", () => {
    const theirs = schema([
      { key: "service_user_name", type: "short_text", label: "Service User Name", required: true },
      {
        key: "region",
        type: "single_select",
        label: "Branch",
        options: [
          { label: "Swansea", value: "Swansea" },
          { label: "Bridgend", value: "Bridgend" },
        ],
      },
    ]);
    assert.equal(fingerprintSchema(theirs), fingerprintSchema(LIBRARY));
  });

  it("still notices a real edit to a baked field, like a renamed label", () => {
    const theirs = schema([
      { key: "service_user_name", type: "short_text", label: "Service User Name", required: true },
      { key: "region", type: "single_select", label: "Area", options: [] },
    ]);
    assert.notEqual(fingerprintSchema(theirs), fingerprintSchema(LIBRARY));
  });

  it("notices a question being removed, added or reworded", () => {
    for (const theirs of [
      schema([{ key: "service_user_name", type: "short_text", label: "Service User Name", required: true }]),
      schema([
        { key: "service_user_name", type: "short_text", label: "Their name", required: true },
        { key: "region", type: "single_select", label: "Branch", options: [] },
      ]),
      schema([
        { key: "service_user_name", type: "short_text", label: "Service User Name", required: true },
        { key: "region", type: "single_select", label: "Branch", options: [] },
        { key: "extra", type: "long_text", label: "Anything else?" },
      ]),
    ]) {
      assert.notEqual(fingerprintSchema(theirs), fingerprintSchema(LIBRARY));
    }
  });

  it("does not depend on the order keys happen to be written in", () => {
    const a = schema([{ key: "q", type: "short_text", label: "Q", required: true }]);
    const b = schema([{ required: true, label: "Q", type: "short_text", key: "q" }]);
    assert.equal(fingerprintSchema(a), fingerprintSchema(b));
  });

  it("keeps the baked key list in step with the database", () => {
    // rebake_form_field_options bakes exactly these. A key added there and not here makes
    // every company holding that form read as edited and quietly stop getting improvements.
    assert.deepEqual(
      [...BAKED_OPTION_FIELD_KEYS].sort(),
      ["branch", "conducted_by", "funding_source", "region"],
    );
  });
});

describe("what a push is allowed to do", () => {
  it("sends to a company that has not touched what we gave them", () => {
    const state = pushStateFor({ theirs: "aaa", library: "bbb", handed: "aaa" });
    assert.equal(state, "behind");
    assert.equal(isPushable(state), true);
  });

  it("sends nothing to a company already holding the library version", () => {
    const state = pushStateFor({ theirs: "bbb", library: "bbb", handed: "aaa" });
    assert.equal(state, "up_to_date");
    assert.equal(isPushable(state), false);
  });

  it("NEVER overwrites a company that edited their copy", () => {
    const state = pushStateFor({ theirs: "ccc", library: "bbb", handed: "aaa" });
    assert.equal(state, "edited");
    assert.equal(isPushable(state), false);
  });

  it("refuses to guess when we have no record of what they were handed", () => {
    for (const handed of [null, undefined, ""]) {
      const state = pushStateFor({ theirs: "ccc", library: "bbb", handed });
      assert.equal(state, "unknown", "an unprovable copy is left alone");
      assert.equal(isPushable(state), false);
    }
  });

  it("counts a copy that matches the library as up to date even with no record", () => {
    assert.equal(pushStateFor({ theirs: "bbb", library: "bbb", handed: null }), "up_to_date");
  });
});

/* The company's own customer satisfaction questions: theirs to write, and not a reason to
   cut them off from every other improvement to the form. */
function withOwned(label: string, extra = "Notes"): FormSchema {
  return {
    schemaVersion: 1,
    sections: [
      { id: "details", title: "Details", fields: [{ key: "name", type: "short_text", label: extra }] as never },
      { id: OWNED_SECTION_ID, title: "Customer Satisfaction", fields: [
        { key: "schedule_matches", type: "single_select", label, satisfaction: true },
      ] as never },
    ],
  } as FormSchema;
}

describe("the section a company owns", () => {
  it("does not count as editing the form", () => {
    assert.equal(
      fingerprintSchema(withOwned("Their own wording")),
      fingerprintSchema(withOwned("The standard wording")),
      "rewording a satisfaction question must not make them read as edited",
    );
  });

  it("still notices a real edit elsewhere on the form", () => {
    assert.notEqual(
      fingerprintSchema(withOwned("Same", "Name")),
      fingerprintSchema(withOwned("Same", "Full name")),
    );
  });

  it("is carried across a push rather than overwritten by the library's", () => {
    const library = withOwned("The library wording", "Full name");
    const theirs = withOwned("Their own wording", "Name");
    const pushed = schemaToPush(library, theirs);
    const owned = pushed.sections.find((s) => s.id === OWNED_SECTION_ID);
    assert.equal(owned?.fields[0].label, "Their own wording", "their questions survive");
    assert.equal(
      pushed.sections.find((s) => s.id === "details")?.fields[0].label,
      "Full name",
      "the rest of the form follows the library",
    );
  });

  it("keeps their section even when the library has none", () => {
    const library: FormSchema = {
      schemaVersion: 1,
      sections: [{ id: "details", title: "Details", fields: [{ key: "name", type: "short_text", label: "Full name" }] as never }],
    } as FormSchema;
    const pushed = schemaToPush(library, withOwned("Theirs"));
    assert.ok(pushed.sections.some((s) => s.id === OWNED_SECTION_ID), "never dropped on the floor");
  });

  it("leaves a company with no section of their own untouched", () => {
    const library = withOwned("Library");
    const plain: FormSchema = {
      schemaVersion: 1,
      sections: [{ id: "details", title: "Details", fields: [] as never }],
    } as FormSchema;
    assert.deepEqual(schemaToPush(library, plain), library);
  });
});
