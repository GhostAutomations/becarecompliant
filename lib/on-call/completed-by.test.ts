import { test } from "node:test";
import assert from "node:assert/strict";
import { completedByLine } from "./format.ts";

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
