import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  BAKED_OPTION_FIELD_KEYS,
  fingerprintSchema,
  isPushable,
  pushStateFor,
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
