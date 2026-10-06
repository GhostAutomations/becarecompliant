import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanReference, coverFromForm, coverFromStored, DEFAULT_COVER, referencePrefix } from "./cover.ts";

test("cover choices come from the lists, anything else falls back", () => {
  const c = coverFromForm((k) => ({ applies_to: "Care and support staff", read_by: "nonsense", classification: "Public", approver_id: " abc " } as Record<string, string>)[k]);
  assert.equal(c.applies_to, "Care and support staff");
  assert.equal(c.read_by, DEFAULT_COVER.read_by);
  assert.equal(c.classification, "Public");
  assert.equal(c.approver_id, "abc");
  assert.deepEqual(coverFromStored(null), DEFAULT_COVER);
});

test("reference areas and typed references", () => {
  assert.equal(referencePrefix(["hr"]), "HR");
  assert.equal(referencePrefix(["ciw", "cqc"]), "CARE");
  assert.equal(referencePrefix([]), "GEN");
  assert.equal(cleanReference(" qp 12 "), "QP-12");
  assert.equal(cleanReference(""), null);
  assert.equal(cleanReference("<script>"), null);
});

import { cleanHexColour, coverReview, documentColours, ordinalDate, reviewReasonFrom, DEFAULT_COLOURS } from "./cover.ts";

test("dates read like Thistle's: 16th February 2026, London time", () => {
  assert.equal(ordinalDate(new Date("2026-02-16T12:00:00Z")), "16th February 2026");
  assert.equal(ordinalDate(new Date("2026-03-01T12:00:00Z")), "1st March 2026");
  assert.equal(ordinalDate(new Date("2026-03-22T12:00:00Z")), "22nd March 2026");
  assert.equal(ordinalDate(new Date("2026-03-23T12:00:00Z")), "23rd March 2026");
  assert.equal(ordinalDate(new Date("2026-03-11T12:00:00Z")), "11th March 2026");
  assert.equal(ordinalDate(new Date("2026-03-12T12:00:00Z")), "12th March 2026");
  // 23:30 UTC on 30 June is 1 July in London.
  assert.equal(ordinalDate(new Date("2026-06-30T23:30:00Z")), "1st July 2026");
});

test("document colours: six digit hex only, Be Care Compliant's otherwise", () => {
  assert.equal(cleanHexColour("#7030A0"), "#7030a0");
  assert.equal(cleanHexColour("purple"), null);
  assert.equal(cleanHexColour("#fff"), null);
  assert.deepEqual(documentColours(null, "#2f5f1e"), { primary: DEFAULT_COLOURS.primary, secondary: "#2f5f1e" });
});

test("review reason: from the list, else New policy or Annual review", () => {
  assert.equal(reviewReasonFrom("Change in law or guidance", false), "Change in law or guidance");
  assert.equal(reviewReasonFrom("", true), "New policy");
  assert.equal(reviewReasonFrom("made up", false), "Annual review");
});

const v = (version: number, iso: string, extra: Partial<{ c: string; r: string; n: string; role: string }> = {}) => ({
  version,
  at: new Date(iso),
  changeSummary: extra.c ?? null,
  reviewReason: extra.r ?? null,
  approvedByName: extra.n ?? null,
  approvedByRole: extra.role ?? null,
});

test("review table: first issue", () => {
  const r = coverReview({ version: 1, versions: [v(1, "2026-10-06T10:00:00Z", { c: "First issue", r: "New policy", n: "Jo Bloggs", role: "Responsible Individual" })], nextReview: new Date("2027-10-06T12:00:00Z") });
  assert.deepEqual(r, {
    reviewedOn: "6th October 2026",
    lastReviewOn: "None, this is the first issue",
    reviewedBy: "Jo Bloggs, Responsible Individual",
    reason: "New policy",
    changes: "First issue",
    nextReview: "6th October 2027",
  });
});

test("review table: a later version names the one before as the last review", () => {
  const vs = [v(1, "2025-02-26T10:00:00Z"), v(2, "2026-02-16T10:00:00Z", { c: "None", r: "Annual review", n: "Jo Bloggs" })];
  const r = coverReview({ version: 2, versions: vs, nextReview: new Date("2027-02-16T12:00:00Z") });
  assert.equal(r.reviewedOn, "16th February 2026");
  assert.equal(r.lastReviewOn, "26th February 2025");
  assert.equal(r.reason, "Annual review");
  assert.equal(r.reviewedBy, "Jo Bloggs");
});

test("review table: Reviewed, no changes needed after approval is the latest review", () => {
  const r = coverReview({
    version: 1,
    versions: [v(1, "2025-02-26T10:00:00Z", { n: "Jo Bloggs" })],
    nextReview: new Date("2027-02-16T12:00:00Z"),
    laterReview: { on: new Date("2026-02-16T12:00:00Z"), byName: "Sam Example", byRole: "Registered Manager" },
  });
  assert.equal(r.reviewedOn, "16th February 2026");
  assert.equal(r.lastReviewOn, "26th February 2025");
  assert.equal(r.reviewedBy, "Sam Example, Registered Manager");
  assert.equal(r.reason, "Annual review");
  assert.equal(r.changes, "None");
});
