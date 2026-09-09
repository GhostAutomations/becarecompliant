import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { describeSubject, labelFor, notOnFile } from "./subject-format.ts";

describe("evidence subject wording", () => {
  it("calls a person a Care Worker and a service user a Service User", () => {
    assert.equal(labelFor("person"), "Care Worker");
    assert.equal(labelFor("service_user"), "Service User");
    assert.equal(labelFor("complaint"), "Complaint");
  });

  it("names the subject on one line for the page footer", () => {
    assert.equal(
      describeSubject({ kind: "person", label: "Care Worker", name: "Joe Bloggs" }),
      "Joe Bloggs (Care Worker)",
    );
  });

  it("says plainly when the record is gone, and never returns a blank name", () => {
    const gone = notOnFile("person", "4d374a2d-bf72-4742-b495-c6c0910782fe");
    assert.equal(gone.name, "Record no longer held");
    assert.equal(gone.label, "Care Worker");
    assert.equal(gone.reference, "4D374A2D");
    assert.match(gone.detail ?? "", /removed/);
  });

  it("never produces an anonymous subject line", () => {
    for (const kind of ["person", "service_user", "complaint"] as const) {
      const s = notOnFile(kind, "00000000-0000-0000-0000-000000000000");
      assert.ok(s.name.trim().length > 0, `${kind} has a name`);
      assert.ok(describeSubject(s).trim().length > 0, `${kind} describes`);
    }
  });
});
