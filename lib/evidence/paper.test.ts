import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PAPER_DATE_KEY,
  PAPER_MAX_BYTES,
  PAPER_MAX_FILES,
  paperCompletedOn,
  paperDateProblem,
  paperFieldKey,
  paperFileProblem,
  paperFilesProblem,
  paperOffered,
  paperPathPrefix,
} from "./paper.ts";
import { completionDate, completionMovesCheck } from "./completion-date.ts";

const TODAY = "2026-09-23";

test("the paper date: required, real, not future, not ancient", () => {
  assert.match(paperDateProblem("", TODAY)!, /Enter the date/);
  assert.match(paperDateProblem(null, TODAY)!, /Enter the date/);
  assert.match(paperDateProblem("2026-02-30", TODAY)!, /real date/);
  assert.match(paperDateProblem("23/09/2026", TODAY)!, /real date/);
  assert.match(paperDateProblem("2026-09-24", TODAY)!, /future/);
  assert.match(paperDateProblem("1999-12-31", TODAY)!, /2000/);
  assert.equal(paperDateProblem(TODAY, TODAY), null);
  assert.equal(paperDateProblem("2024-02-29", TODAY), null); // leap day
  assert.equal(paperDateProblem("2025-03-01", TODAY), null);
});

test("files: PDFs and photos only, none empty, none too big", () => {
  assert.equal(paperFileProblem({ name: "Sup 1.pdf", size: 1000 }), null);
  assert.equal(paperFileProblem({ name: "IMG_0001.HEIC", size: 1000 }), null);
  assert.equal(paperFileProblem({ name: "page.JPEG", size: 1000 }), null);
  assert.match(paperFileProblem({ name: "notes.docx", size: 1000 })!, /not a PDF or a photo/);
  assert.match(paperFileProblem({ name: "noextension", size: 1000 })!, /not a PDF or a photo/);
  assert.match(paperFileProblem({ name: "a.pdf", size: 0 })!, /empty/);
  assert.match(paperFileProblem({ name: "a.pdf", size: PAPER_MAX_BYTES + 1 })!, /over 20 MB/);
  assert.equal(paperFileProblem({ name: "a.pdf", size: PAPER_MAX_BYTES }), null);
});

test("a file is required, and there is a ceiling", () => {
  assert.match(paperFilesProblem([])!, /Add the scanned copy/);
  const many = Array.from({ length: PAPER_MAX_FILES + 1 }, (_, i) => ({ name: `p${i}.jpg`, size: 10 }));
  assert.match(paperFilesProblem(many)!, /up to 10/);
  assert.equal(paperFilesProblem(many.slice(0, PAPER_MAX_FILES)), null);
  assert.match(paperFilesProblem([{ name: "a.pdf", size: 5 }, { name: "b.exe", size: 5 }])!, /b\.exe/);
});

test("only the newest completion moves the Check; older ones are history", () => {
  assert.equal(completionMovesCheck("2026-03-01", null), true);
  assert.equal(completionMovesCheck("2026-03-01", "2026-06-01"), false);
  assert.equal(completionMovesCheck("2026-06-01", "2026-06-01"), true);
  assert.equal(completionMovesCheck("2026-07-01", "2026-06-01"), true);
});

test("the paper date is the completion date wherever Evidence is dated", () => {
  // A supervision form whose own date question was never answered, because it was on paper.
  const answers = { [PAPER_DATE_KEY]: "2026-03-14", supervision_type: "1" };
  assert.equal(completionDate(answers, "2026-09-23T10:00:00Z", "supervision_date"), "2026-03-14");
  // A form with no date question at all: still the paper date, never the upload day.
  assert.equal(completionDate(answers, "2026-09-23T10:00:00Z", null), "2026-03-14");
  assert.equal(paperCompletedOn(answers), "2026-03-14");
  assert.equal(paperCompletedOn({ supervision_date: "2026-03-14" }), null);
});

test("paths and keys", () => {
  assert.equal(paperFieldKey(3), "paper_copy_3");
  assert.equal(paperPathPrefix("c", "e"), "c/e/files/paper_copy_");
});

test("admins only, and not on the Setup Visit or an expiry dated check", () => {
  const base = { role: "company_admin", supportMode: false, population: "people" as const, checkKey: "supervision", anchor: "completion" };
  assert.equal(paperOffered(base), true);
  for (const role of ["manager", "registered_manager", "supervisor", "registered_individual", "platform_admin", "staff"]) {
    assert.equal(paperOffered({ ...base, role }), false, role);
  }
  assert.equal(paperOffered({ ...base, supportMode: true }), false);
  assert.equal(paperOffered({ ...base, population: "service_users", checkKey: "setup" }), false);
  assert.equal(paperOffered({ ...base, population: "service_users", checkKey: "care_plan_review" }), true);
  assert.equal(paperOffered({ ...base, anchor: "expiry" }), false);
});
