import test from "node:test";
import assert from "node:assert/strict";
import { courseAppliesToTitle, inProbation, splitByProbation } from "./probation-group.ts";

test("due and extended are still in probation", () => {
  assert.equal(inProbation("due"), true);
  // Extended is a longer probation, not a finished one.
  assert.equal(inProbation("extended"), true);
});

test("passed and failed are out of probation", () => {
  assert.equal(inProbation("passed"), false);
  assert.equal(inProbation("failed"), false);
});

test("no status is treated as out, not swept into a group nobody chose", () => {
  // Every carer added through the product gets 'due' on creation, so a blank is an imported
  // or older record.
  assert.equal(inProbation(null), false);
  assert.equal(inProbation(undefined), false);
  assert.equal(inProbation(""), false);
  assert.equal(inProbation("   "), false);
});

test("status is read the way a stored value arrives", () => {
  assert.equal(inProbation("  Due  "), true);
  assert.equal(inProbation("Passed"), false);
});

test("the split keeps the order it was given", () => {
  const rows = [
    { n: "Asim", s: "passed" },
    { n: "Smith", s: "due" },
    { n: "Vera", s: "passed" },
    { n: "New Starter", s: "extended" },
  ];
  const { probation, team } = splitByProbation(rows, (r) => r.s);
  assert.deepEqual(probation.map((r) => r.n), ["Smith", "New Starter"]);
  assert.deepEqual(team.map((r) => r.n), ["Asim", "Vera"]);
});

/* Nobody in probation is the signal to show no groups at all: an established company should
   see the plain register it has always seen, not an empty heading. */
test("nobody in probation leaves the probation list empty", () => {
  const rows = [{ s: "passed" }, { s: "failed" }, { s: null }];
  const { probation, team } = splitByProbation(rows, (r) => r.s);
  assert.equal(probation.length, 0);
  assert.equal(team.length, 3);
});

test("an empty register splits into two empty lists", () => {
  const { probation, team } = splitByProbation([] as Array<{ s: string }>, (r) => r.s);
  assert.deepEqual(probation, []);
  assert.deepEqual(team, []);
});

/* COURSE SCOPING BY JOB TITLE (Phil, 2026-09-16). Four courses are for supervisors and
   above; before this they sat red on all thirteen Cardiff carers. */
test("a course that names no titles belongs to everybody", () => {
  assert.equal(courseAppliesToTitle(null, "Care Assistant"), true);
  assert.equal(courseAppliesToTitle([], "Care Assistant"), true);
  assert.equal(courseAppliesToTitle(undefined, null), true);
});

test("a scoped course belongs only to the titles it names", () => {
  const supAndAbove = ["Supervisor", "Senior Supervisor", "Deputy Manager", "Registered Manager", "Responsible Individual"];
  assert.equal(courseAppliesToTitle(supAndAbove, "Supervisor"), true);
  assert.equal(courseAppliesToTitle(supAndAbove, "Registered Manager"), true);
  assert.equal(courseAppliesToTitle(supAndAbove, "Care Assistant"), false);
  // Senior Care Assistant is deliberately OUT, unlike the Lead the Leader check.
  assert.equal(courseAppliesToTitle(supAndAbove, "Senior Care Assistant"), false);
});

test("a title is matched the way a person types it", () => {
  assert.equal(courseAppliesToTitle(["Supervisor"], "  supervisor  "), true);
  assert.equal(courseAppliesToTitle(["  Supervisor "], "SUPERVISOR"), true);
});

test("no job title gets only the courses that name nobody", () => {
  // Which is why a blank job title on import now defaults to Care Assistant.
  assert.equal(courseAppliesToTitle(["Supervisor"], null), false);
  assert.equal(courseAppliesToTitle(["Supervisor"], "   "), false);
  assert.equal(courseAppliesToTitle(null, null), true);
});

