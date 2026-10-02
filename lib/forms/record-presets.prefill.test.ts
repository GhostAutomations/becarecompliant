import { test } from "node:test";
import assert from "node:assert/strict";
import { recordFormPresets } from "./record-presets.ts";

test("a question set to fill in automatically in the builder is filled, whatever its key", () => {
  const schema = {
    schemaVersion: 1,
    sections: [
      {
        id: "s1",
        title: "Audit Details",
        fields: [
          { key: "audit_date", type: "date" as const, label: "Audit Date", prefill: "today" as const },
          { key: "auditors_name", type: "short_text" as const, label: "Auditors Name", prefill: "completed_by" as const },
          { key: "branch_location", type: "short_text" as const, label: "Branch/Location", prefill: "record_branch" as const },
          { key: "service_users_name", type: "short_text" as const, label: "Service Users Name", prefill: "record_name" as const },
          { key: "office", type: "single_select" as const, label: "Office", prefill: "record_branch" as const, options: [{ value: "cardiff", label: "Cardiff" }] },
          { key: "date_of_start", type: "date" as const, label: "Date of Start" },
        ],
      },
    ],
  };
  const p = recordFormPresets(schema, { fullName: "Mary Jones", branchName: "Cardiff", authorName: "Hayley Jeffries", today: "2026-10-02" });
  assert.equal(p.audit_date, "2026-10-02");
  assert.equal(p.auditors_name, "Hayley Jeffries");
  assert.equal(p.branch_location, "Cardiff");
  assert.equal(p.service_users_name, "Mary Jones");
  assert.equal(p.office, "cardiff");
  // Today went to the chosen date question, so the start date is left for the person to fill in.
  assert.equal(p.date_of_start, undefined);
});
