import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingHref, type BookingLink } from "./booking-link.ts";

const PLANNED_PERSON: BookingLink = {
  population: "people",
  subjectId: "p1",
  checkInstanceId: "ci1",
  status: "planned",
};

test("a booked check opens the form that completes it", () => {
  assert.equal(bookingHref(PLANNED_PERSON), "/people/p1/checks/ci1/complete");
});

test("a service user check opens the service user's form", () => {
  assert.equal(
    bookingHref({ ...PLANNED_PERSON, population: "service_users", subjectId: "s1" }),
    "/service-users/s1/checks/ci1/complete",
  );
});

test("a completed task opens the record, not the form again", () => {
  assert.equal(bookingHref({ ...PLANNED_PERSON, status: "completed" }), "/people/p1");
});

test("a cancelled task opens the record", () => {
  assert.equal(bookingHref({ ...PLANNED_PERSON, status: "cancelled" }), "/people/p1");
});

test("a task with no check opens the record, because there is no form to open", () => {
  assert.equal(bookingHref({ ...PLANNED_PERSON, checkInstanceId: null }), "/people/p1");
});

test("an ad-hoc task with nobody attached opens nothing", () => {
  assert.equal(bookingHref({ ...PLANNED_PERSON, population: null, subjectId: null }), null);
  assert.equal(bookingHref({ ...PLANNED_PERSON, subjectId: null }), null);
  assert.equal(bookingHref({ ...PLANNED_PERSON, population: null }), null);
});

/* Tracker forms: Probation, DBS and Right to Work have no check instance to point at. */

test("a booked probation review opens the tracker form", () => {
  assert.equal(
    bookingHref({
      population: "people",
      subjectId: "p1",
      checkInstanceId: null,
      trackerFormKey: "probation_review",
      status: "planned",
    }),
    "/people/p1/tracker/probation_review/complete",
  );
});

test("a completed tracker task opens the record, not the form again", () => {
  assert.equal(
    bookingHref({
      population: "people",
      subjectId: "p1",
      checkInstanceId: null,
      trackerFormKey: "dbs_renewal",
      status: "completed",
    }),
    "/people/p1",
  );
});

test("a tracker key on a service user opens the record, because they have no trackers", () => {
  assert.equal(
    bookingHref({
      population: "service_users",
      subjectId: "s1",
      checkInstanceId: null,
      trackerFormKey: "probation_review",
      status: "planned",
    }),
    "/service-users/s1",
  );
});
