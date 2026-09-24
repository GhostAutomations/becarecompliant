import { test } from "node:test";
import assert from "node:assert/strict";
import { completedByLine, urgentIsOverdue } from "./format.ts";

test("a handover says who completed it, from the logins", () => {
  assert.equal(
    completedByLine({ finalised_by_name: "Lauren Morgan", created_by_name: "Lauren Morgan", handler_person_name: "Lauren Morgan" }),
    "Completed by Lauren Morgan",
  );
  assert.equal(
    completedByLine({ finalised_by_name: "Charlotte Davies", created_by_name: "Lauren Morgan", handler_person_name: "Charlotte Davies" }),
    "Started by Lauren Morgan, completed by Charlotte Davies",
  );
  assert.equal(
    completedByLine({ finalised_by_name: null, created_by_name: null, handler_person_name: "Lauren Morgan" }),
    "Completed by Lauren Morgan",
  );
  assert.equal(
    completedByLine({ finalised_by_name: null, created_by_name: null, handler_person_name: null }),
    "Who completed it was not recorded.",
  );
});

test("an urgent follow up turns overdue 24 hours after its handover was saved", () => {
  const saved = "2026-09-22T21:33:08Z";
  const at = (iso: string) => Date.parse(iso);
  assert.equal(urgentIsOverdue(saved, at("2026-09-23T21:33:07Z")), false);
  assert.equal(urgentIsOverdue(saved, at("2026-09-23T21:33:08Z")), true);
  assert.equal(urgentIsOverdue(saved, at("2026-09-24T09:00:00Z")), true);
  assert.equal(urgentIsOverdue("not a date", at("2026-09-24T09:00:00Z")), false);
});
