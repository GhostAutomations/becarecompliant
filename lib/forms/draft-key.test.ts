import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_HOURS,
  checkDraftKey,
  dialogDraftKey,
  draftFresh,
  draftKey,
  mergeDraft,
  trackerDraftKey,
} from "./draft-key.ts";

test("two forms open at once are two different drafts", () => {
  // The whole reason this is not one row per user: a carer can have a spot check on a
  // Service User and a supervision on a colleague part-finished at the same time.
  const a = checkDraftKey("service_users", "11111111-1111-1111-1111-111111111111");
  const b = checkDraftKey("people", "22222222-2222-2222-2222-222222222222");
  assert.notEqual(a, b);
});

test("the same check is the same draft however you got to it", () => {
  assert.equal(
    checkDraftKey("people", "abc"),
    checkDraftKey("people", "abc"),
  );
});

test("an id shared across the two check tables is still two drafts", () => {
  assert.notEqual(checkDraftKey("people", "same"), checkDraftKey("service_users", "same"));
});

test("a tracker form is keyed by person and by which form", () => {
  assert.equal(trackerDraftKey("p1", "dbs"), "tracker|p1|dbs");
  assert.notEqual(trackerDraftKey("p1", "dbs"), trackerDraftKey("p1", "right_to_work"));
  assert.notEqual(trackerDraftKey("p1", "dbs"), trackerDraftKey("p2", "dbs"));
});

test("the same dialog opened on someone else is a different draft", () => {
  const forJoan = dialogDraftKey("Record absence", { person_id: "joan" });
  const forLilwen = dialogDraftKey("Record absence", { person_id: "lilwen" });
  assert.notEqual(forJoan, forLilwen);
});

test("the dialog key does not depend on the order the hidden fields were built in", () => {
  assert.equal(
    dialogDraftKey("Decide holiday", { person_id: "p", request_id: "r" }),
    dialogDraftKey("Decide holiday", { request_id: "r", person_id: "p" }),
  );
});

test("a blank part cannot collide with a form that has one", () => {
  assert.notEqual(draftKey("dialog", ["Request holiday", ""]), draftKey("dialog", ["Request holiday", "x"]));
  assert.equal(draftKey("dialog", ["Request holiday", ""]), "dialog|Request holiday");
});

test("a draft is handed back for twelve hours and no longer", () => {
  const now = Date.parse("2026-08-18T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000).toISOString();
  assert.equal(draftFresh(hoursAgo(1), now), true);
  assert.equal(draftFresh(hoursAgo(DRAFT_HOURS - 0.01), now), true);
  assert.equal(draftFresh(hoursAgo(DRAFT_HOURS + 0.01), now), false);
  assert.equal(draftFresh(hoursAgo(48), now), false);
});

test("nothing saved, or an unreadable timestamp, is not a draft", () => {
  assert.equal(draftFresh(null), false);
  assert.equal(draftFresh(undefined), false);
  assert.equal(draftFresh("not a date"), false);
});

test("a phone whose clock runs fast has not lost its work", () => {
  const now = Date.parse("2026-08-18T12:00:00Z");
  assert.equal(draftFresh(new Date(now + 60_000).toISOString(), now), true);
});

test("what they typed beats what the button seeded", () => {
  assert.deepEqual(
    mergeDraft({ supervision_number: "3", notes: "" }, { notes: "Half written" }),
    { supervision_number: "3", notes: "Half written" },
  );
});

test("no presets and no draft leaves the form exactly as it was", () => {
  assert.equal(mergeDraft(undefined, null), undefined);
  assert.equal(mergeDraft({}, {}), undefined);
});
