import { test } from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files, so the module under test is reached this way. */
import {
  completionDate,
  completionDates,
  dateKeyOf,
  dateKeysByVersion,
} from "./completion-date.ts";

const APPRAISAL = {
  sections: [
    { fields: [{ key: "appraisal_date", type: "date", label: "Date of appraisal" }] },
    { fields: [{ key: "a_punctuality", type: "single_select" }] },
  ],
};

const SUPERVISION = {
  sections: [
    { fields: [{ key: "took_place", type: "single_select" }] },
    {
      fields: [
        { key: "supervision_date", type: "date" },
        { key: "next_due", type: "date" },
      ],
    },
  ],
};

test("the date question is found by type, not by name", () => {
  assert.equal(dateKeyOf(APPRAISAL), "appraisal_date");
});

test("the FIRST date question wins, so a second date is not mistaken for the completion", () => {
  assert.equal(dateKeyOf(SUPERVISION), "supervision_date");
});

test("a renamed date question is still found, which is the whole point", () => {
  /* Phil, 2026-09-08: the appraisal rebuild renamed date_of_appraisal to appraisal_date
     and the matrix silently reported the submission date, sixty three days out. */
  const renamed = { sections: [{ fields: [{ key: "date_the_appraisal_happened", type: "date" }] }] };
  assert.equal(dateKeyOf(renamed), "date_the_appraisal_happened");
});

test("a form with no date question has no date key", () => {
  assert.equal(dateKeyOf({ sections: [{ fields: [{ key: "notes", type: "long_text" }] }] }), null);
});

test("rubbish where a schema should be is survived, not thrown on", () => {
  assert.equal(dateKeyOf(null), null);
  assert.equal(dateKeyOf(undefined), null);
  assert.equal(dateKeyOf({}), null);
  assert.equal(dateKeyOf({ sections: "nope" }), null);
  assert.equal(dateKeyOf({ sections: [{}, { fields: null }] }), null);
  assert.equal(dateKeyOf({ sections: [{ fields: [{ type: "date" }] }] }), null);
});

test("the answer to the date question is the completion date", () => {
  assert.equal(
    completionDate({ appraisal_date: "2026-11-10" }, "2026-09-08T21:29:25Z", "appraisal_date"),
    "2026-11-10",
  );
});

test("no date question means the day it was submitted", () => {
  assert.equal(completionDate({ notes: "x" }, "2026-09-08T21:29:25Z", null), "2026-09-08");
});

test("an unanswered or unusable date falls back to the submission day", () => {
  assert.equal(completionDate({}, "2026-09-08T21:29:25Z", "appraisal_date"), "2026-09-08");
  assert.equal(
    completionDate({ appraisal_date: "" }, "2026-09-08T21:29:25Z", "appraisal_date"),
    "2026-09-08",
  );
  assert.equal(
    completionDate({ appraisal_date: "10/11/2026" }, "2026-09-08T21:29:25Z", "appraisal_date"),
    "2026-09-08",
  );
  assert.equal(completionDate(null, "2026-09-08T21:29:25Z", "appraisal_date"), "2026-09-08");
});

test("a back dated completion is kept, so the next one is scheduled from when it happened", () => {
  assert.equal(
    completionDate({ supervision_date: "2026-06-01" }, "2026-09-08T21:29:25Z", "supervision_date"),
    "2026-06-01",
  );
});

test("each version is read with its own date question", () => {
  /* The question was renamed between v1 and v2; a record filed under v1 still reports the
     date it was actually filled in with. */
  const keys = dateKeysByVersion([
    { id: "v1", schema: { sections: [{ fields: [{ key: "date_of_appraisal", type: "date" }] }] } },
    { id: "v2", schema: APPRAISAL },
  ]);
  assert.deepEqual(
    [...keys.entries()],
    [
      ["v1", "date_of_appraisal"],
      ["v2", "appraisal_date"],
    ],
  );

  assert.deepEqual(
    completionDates(
      [
        {
          submitted_at: "2025-09-08T10:00:00Z",
          answers: { date_of_appraisal: "2025-09-01" },
          form_version_id: "v1",
        },
        {
          submitted_at: "2026-09-08T21:29:25Z",
          answers: { appraisal_date: "2026-11-10" },
          form_version_id: "v2",
        },
      ],
      keys,
    ),
    ["2025-09-01", "2026-11-10"],
  );
});

test("evidence from a version we could not read still gets a date", () => {
  assert.deepEqual(
    completionDates(
      [
        {
          submitted_at: "2026-09-08T21:29:25Z",
          answers: { appraisal_date: "2026-11-10" },
          form_version_id: "gone",
        },
      ],
      new Map(),
    ),
    ["2026-09-08"],
  );
});
