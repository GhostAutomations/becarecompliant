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

import { dbsRiskMarker } from "./dbs-pending.ts";

test("DBS risk column: Pending while waiting, Assessed for the current certificate, blank otherwise", () => {
  const base = { latestPending: null, latestDisclosure: null, dbsDate: null, todayIso: TODAY };
  assert.equal(dbsRiskMarker(base), null);
  assert.deepEqual(dbsRiskMarker({ ...base, latestPending: { decision: "start", review_date: "2026-10-12" } }), {
    label: "Pending",
    tone: "amber",
  });
  assert.equal(
    dbsRiskMarker({ ...base, latestPending: { decision: "start", review_date: "2026-10-01" } })?.tone,
    "red",
  );
  // Certificate arrived and nothing was shown: blank.
  assert.equal(dbsRiskMarker({ ...base, latestPending: { decision: "start" }, dbsDate: "2026-10-03" }), null);
  // Disclosure on the current certificate.
  assert.deepEqual(
    dbsRiskMarker({ ...base, latestDisclosure: { cert_issue_date: "2026-10-03" }, dbsDate: "2026-10-03" }),
    { label: "Assessed", tone: "neutral" },
  );
  // A newer certificate since: the marker clears.
  assert.equal(dbsRiskMarker({ ...base, latestDisclosure: { cert_issue_date: "2023-10-03" }, dbsDate: "2026-10-03" }), null);
  // Pending wins over an older disclosure while waiting for a new certificate.
  assert.equal(
    dbsRiskMarker({
      ...base,
      latestPending: { decision: "wait" },
      latestDisclosure: { cert_issue_date: "2023-10-03" },
    })?.label,
    "Pending",
  );
});

test("a renewal: an older certificate on file does not end a Pending assessment", () => {
  assert.equal(
    dbsPendingState({ latest: { decision: "start", review_date: "2026-10-12", dbs_applied_on: "2026-10-01" }, dbsDate: "2023-06-01", todayIso: TODAY })?.decision,
    "start",
  );
  assert.equal(
    dbsPendingState({ latest: { decision: "start", dbs_applied_on: "2026-10-01" }, dbsDate: "2026-10-03", todayIso: TODAY }),
    null,
  );
});
