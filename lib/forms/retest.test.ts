import { test } from "node:test";
import assert from "node:assert/strict";
import { retestDue, withRetest } from "./retest.ts";

const schema = {
  sections: [
    {
      id: "s",
      title: "Spot check",
      fields: [
        {
          key: "passed",
          type: "single_select" as const,
          label: "Has the carer passed the spot check?",
          retestWithin: { when: ["fail"], days: 7 },
        },
      ],
    },
  ],
};

test("a failed spot check is due again in 7 days, not 28", () => {
  const retest = retestDue(schema, { passed: "fail" }, "2026-09-10");
  assert.equal(retest, "2026-09-17");
  assert.equal(withRetest("2026-10-08", retest), "2026-09-17");
});

test("a pass leaves the usual next due date alone", () => {
  assert.equal(retestDue(schema, { passed: "pass" }, "2026-09-10"), null);
  assert.equal(withRetest("2026-10-08", null), "2026-10-08");
});
