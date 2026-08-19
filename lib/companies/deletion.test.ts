import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files. deletion.ts has no runtime imports for exactly this reason. */
import {
  GRACE_DAYS,
  companyIsLocked,
  purgeAfterFrom,
  purgeIsDue,
  daysUntilPurge,
  deleteRefusal,
  restoreRefusal,
  purgeRefusal,
} from "./deletion.ts";

const NOW = "2026-08-18T12:00:00.000Z";

test("THE DEFECT THIS FIXES: a suspended company is actually locked out", () => {
  // Until 2026-08-18 nothing read companies.status at all, so Suspend was decoration.
  assert.equal(companyIsLocked("active"), false);
  assert.equal(companyIsLocked("suspended"), true);
  assert.equal(companyIsLocked("archived"), true);
  assert.equal(companyIsLocked("deleted"), true);
  // A missing status must never lock a working company out.
  assert.equal(companyIsLocked(null), false);
  assert.equal(companyIsLocked(undefined), false);
});

test("the grace period is thirty days from the deletion", () => {
  assert.equal(GRACE_DAYS, 30);
  assert.equal(purgeAfterFrom("2026-08-18T12:00:00.000Z"), "2026-09-17T12:00:00.000Z");
});

test("a purge is due only once the clock has run out", () => {
  const after = purgeAfterFrom(NOW);
  assert.equal(purgeIsDue(after, NOW), false);
  assert.equal(purgeIsDue(after, "2026-09-17T12:00:01.000Z"), true);
});

test("an unreadable or missing purge date is never due", () => {
  // The failure direction of an erasure has to be "wait", never "erase".
  assert.equal(purgeIsDue(null, NOW), false);
  assert.equal(purgeIsDue("not a date", NOW), false);
});

test("days left is shown whole and never negative", () => {
  assert.equal(daysUntilPurge(purgeAfterFrom(NOW), NOW), 30);
  assert.equal(daysUntilPurge("2026-08-01T12:00:00.000Z", NOW), 0);
});

const del = (over: Record<string, unknown> = {}) => ({
  typedName: "Acme Care Company",
  companyName: "Acme Care Company",
  status: "active",
  isFounder: true,
  ...over,
});

test("the founder may delete a company when the typed name matches", () => {
  assert.equal(deleteRefusal(del()), null);
});

test("typing is forgiving about case and spacing, never about the name", () => {
  assert.equal(deleteRefusal(del({ typedName: "  acme   care company " })), null);
  const wrong = deleteRefusal(del({ typedName: "Acme Care" }));
  assert.match(String(wrong), /Type the company's name exactly/);
});

test("nobody but the founder can delete a company", () => {
  assert.equal(deleteRefusal(del({ isFounder: false })), "Only the founder can delete a company.");
});

test("a company already deleted is not deleted twice", () => {
  assert.match(String(deleteRefusal(del({ status: "deleted" }))), /already deleted/);
});

test("a deleted company can be restored, a purged one cannot", () => {
  assert.equal(restoreRefusal({ status: "deleted", purgedAt: null, isFounder: true }), null);
  assert.match(
    String(restoreRefusal({ status: "deleted", purgedAt: NOW, isFounder: true })),
    /already been purged/,
  );
  assert.match(
    String(restoreRefusal({ status: "active", purgedAt: null, isFounder: true })),
    /not deleted/,
  );
});

test("a company that was never deleted can never be purged, forced or not", () => {
  const refusal = purgeRefusal({
    status: "active",
    purgeAfter: null,
    purgedAt: null,
    nowISO: NOW,
    force: true,
  });
  assert.match(String(refusal), /Only a deleted company can be purged/);
});

test("the clock is skipped by Purge now, and only by Purge now", () => {
  const notDueYet = {
    status: "deleted",
    purgeAfter: purgeAfterFrom(NOW),
    purgedAt: null,
    nowISO: NOW,
  };
  assert.match(String(purgeRefusal({ ...notDueYet, force: false })), /30 days of the grace period left/);
  assert.equal(purgeRefusal({ ...notDueYet, force: true }), null);
});

test("one day left reads as a day, not as days", () => {
  const refusal = purgeRefusal({
    status: "deleted",
    purgeAfter: "2026-08-19T12:00:00.000Z",
    purgedAt: null,
    nowISO: NOW,
    force: false,
  });
  assert.match(String(refusal), /1 day of the grace period left/);
});

test("a purge never runs twice over the same company", () => {
  assert.match(
    String(
      purgeRefusal({
        status: "deleted",
        purgeAfter: "2026-07-01T00:00:00.000Z",
        purgedAt: "2026-07-02T00:00:00.000Z",
        nowISO: NOW,
        force: true,
      }),
    ),
    /already been purged/,
  );
});
