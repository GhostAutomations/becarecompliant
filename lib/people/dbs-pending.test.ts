import { test } from "node:test";
import assert from "node:assert/strict";
import { dbsPendingState } from "./dbs-pending.ts";

const TODAY = "2026-10-05";

test("no Pending assessment, nothing to say", () => {
  assert.equal(dbsPendingState({ latest: null, dbsDate: null, todayIso: TODAY }), null);
});

test("working under safeguards is amber until the review is missed", () => {
  assert.deepEqual(
    dbsPendingState({ latest: { decision: "start", review_date: "2026-10-12" }, dbsDate: null, todayIso: TODAY }),
    { decision: "start", reviewDue: "2026-10-12", rag: "amber" },
  );
  // Review due today is still in date.
  assert.equal(dbsPendingState({ latest: { decision: "start", review_date: TODAY }, dbsDate: null, todayIso: TODAY })?.rag, "amber");
  assert.equal(
    dbsPendingState({ latest: { decision: "start", review_date: "2026-10-04" }, dbsDate: null, todayIso: TODAY })?.rag,
    "red",
  );
});

test("told to wait shows as pending with no review", () => {
  assert.deepEqual(dbsPendingState({ latest: { decision: "wait" }, dbsDate: null, todayIso: TODAY }), {
    decision: "wait",
    reviewDue: null,
    rag: "amber",
  });
});

test("it clears itself once the DBS date of issue is entered", () => {
  assert.equal(
    dbsPendingState({ latest: { decision: "start", review_date: "2026-09-01" }, dbsDate: "2026-10-01", todayIso: TODAY }),
    null,
  );
});
