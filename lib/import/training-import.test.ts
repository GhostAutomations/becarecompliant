import { test } from "node:test";
import assert from "node:assert/strict";
import {
  trainingHeader,
  normaliseHeader,
  classifyHeaders,
  deriveRenewalDate,
  deriveCompletedDate,
} from "../training/renewal.ts";

/**
 * The training import, and the question that produced it (Phil, 2026-08-01): "will the download
 * template match column names if a company changes them?"
 *
 * The answer is yes at the moment of download, because the template is generated from that
 * company's own live course names. The hazard is a STALE file: downloaded, then a course renamed,
 * then uploaded. In the People importer that lost the whole column in silence. Here the header is
 * matched loosely and anything unrecognised is reported, and this pins the loose match.
 */

test("the header says what the cell should hold, so nobody has to guess", () => {
  // A matrix kept by a registered manager records when a certificate RUNS OUT.
  assert.equal(trainingHeader("Fire Training", 24), "Fire Training renewal date");
  // A one off cannot run out, so it asks for the opposite.
  assert.equal(trainingHeader("Welcome to the Company", null), "Welcome to the Company (completed)");
});

test("a renewal date and a completion are each other's inverse", () => {
  /*
   * The import reads a renewal date and works the completion back from it. If those two
   * disagreed, a carer's certificate would drift by the length of its own renewal every time a
   * matrix was re-imported.
   */
  for (const months of [1, 3, 6, 12, 24, 36]) {
    for (const iso of ["2026-08-01", "2026-01-15", "2027-12-15", "2028-03-10"]) {
      const renewal = deriveRenewalDate(iso, months);
      assert.ok(renewal, "expected a renewal date");
      assert.equal(deriveCompletedDate(renewal, months), iso, `${iso} +/- ${months} months`);
    }
  }
});

test("a date at the end of a month does not always round trip, which is arithmetic", () => {
  /*
   * 29 February 2028 plus twelve months clamps to 28 February 2029, because 2029 is not a leap
   * year, and twelve months back from there is 28 February 2028. Half a day of a certificate,
   * never in the carer's favour, and unavoidable once a calendar has months of different lengths.
   *
   * Pinned so nobody "fixes" it into something that quietly LENGTHENS a certificate, and so the
   * inverse test above is understood to hold for ordinary dates rather than all of them.
   */
  const renewal = deriveRenewalDate("2028-02-29", 12);
  assert.equal(renewal, "2029-02-28");
  assert.equal(deriveCompletedDate(renewal as string, 12), "2028-02-28");
});

test("a header match ignores case and stray spacing", () => {
  // The rule the importer normalises with. A manager who retypes a heading in Excel, or whose
  // spreadsheet adds a trailing space, should not lose a whole course.
  assert.equal(
    normaliseHeader("  Fire Training   renewal date "),
    normaliseHeader("fire training renewal date"),
  );
  assert.notEqual(
    normaliseHeader("Fire Safety renewal date"),
    normaliseHeader("Fire Training renewal date"),
  );
});

test("THE ANSWER TO PHIL'S QUESTION: a renamed course is named, never dropped in silence", () => {
  /*
   * "will the download template match column names if a company changes them?"
   *
   * At the moment of download, yes: the template is generated from that company's own live course
   * names. The hazard is a file downloaded BEFORE a rename. Matching by name alone would skip
   * that course without a word, which is what the People importer still does. Both directions
   * come back so the preview can say so before a single row is written.
   */
  const expected = ["Full name*", "Branch*", "Fire Safety renewal date", "Food Safety renewal date"];
  // A file downloaded when the course was still called Fire Training.
  const file = ["Full name*", "Branch*", "Fire Training renewal date", "Food Safety renewal date"];

  const { unknown, missing } = classifyHeaders(file, expected);
  assert.deepEqual(unknown, ["Fire Training renewal date"]);
  assert.deepEqual(missing, ["Fire Safety renewal date"]);
});

test("a file that matches has nothing to report, whatever the case or spacing", () => {
  const expected = ["Full name*", "Branch*", "Fire Training renewal date"];
  const file = ["full name*", "  BRANCH*  ", "Fire   Training renewal date"];
  const { unknown, missing } = classifyHeaders(file, expected);
  assert.deepEqual(unknown, []);
  assert.deepEqual(missing, []);
});

test("an empty trailing column is not reported as junk", () => {
  // Excel adds these constantly. Reporting them would train people to ignore the warning.
  const { unknown } = classifyHeaders(["Full name*", "Branch*", "", "   "], ["Full name*", "Branch*"]);
  assert.deepEqual(unknown, []);
});

test("a one off course asks for the opposite of a recurring one", () => {
  // The heading is the only thing telling a manager which date to type, and getting it the wrong
  // way round would put every certificate out by the length of its own renewal.
  assert.equal(trainingHeader("Manual Handling", 12), "Manual Handling renewal date");
  assert.equal(trainingHeader("Induction", null), "Induction (completed)");
  assert.notEqual(normaliseHeader(trainingHeader("X", 12)), normaliseHeader(trainingHeader("X", null)));
});
