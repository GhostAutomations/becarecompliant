import { test } from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files, so the module under test is reached this way. */
import { checkAppliesToTitle, checksForTitle } from "./check-scope.ts";

const EVERYONE = { job_titles: null };
const LEADERS = { job_titles: ["Supervisor", "Senior Supervisor", "Deputy Manager"] };

test("a check naming no job titles belongs to everybody", () => {
  assert.equal(checkAppliesToTitle(EVERYONE, "Care Assistant"), true);
  assert.equal(checkAppliesToTitle(EVERYONE, null), true);
  assert.equal(checkAppliesToTitle({ job_titles: [] }, "Care Assistant"), true);
  assert.equal(checkAppliesToTitle({}, "Care Assistant"), true);
});

test("a check naming job titles belongs only to those", () => {
  assert.equal(checkAppliesToTitle(LEADERS, "Supervisor"), true);
  assert.equal(checkAppliesToTitle(LEADERS, "Deputy Manager"), true);
  assert.equal(checkAppliesToTitle(LEADERS, "Care Assistant"), false);
});

test("a job title is typed by a person, so it is matched forgivingly", () => {
  assert.equal(checkAppliesToTitle(LEADERS, "supervisor"), true);
  assert.equal(checkAppliesToTitle(LEADERS, "  Supervisor  "), true);
  assert.equal(checkAppliesToTitle(LEADERS, "SENIOR SUPERVISOR"), true);
});

test("no job title at all does not qualify for a restricted check", () => {
  /* Better to leave it off a record with a blank job title than to put a leadership
     supervision on somebody nobody has classified yet. */
  assert.equal(checkAppliesToTitle(LEADERS, null), false);
  assert.equal(checkAppliesToTitle(LEADERS, ""), false);
  assert.equal(checkAppliesToTitle(LEADERS, "   "), false);
});

test("a title that merely contains the word does not qualify", () => {
  assert.equal(checkAppliesToTitle(LEADERS, "Supervisor Assistant"), false);
  assert.equal(checkAppliesToTitle(LEADERS, "Trainee Supervisor"), false);
});

test("filtering keeps the order it was given", () => {
  const defs = [
    { key: "spot_check", ...EVERYONE },
    { key: "lead_the_leader", ...LEADERS },
    { key: "audit", ...EVERYONE },
  ];
  assert.deepEqual(
    checksForTitle(defs, "Care Assistant").map((d) => d.key),
    ["spot_check", "audit"],
  );
  assert.deepEqual(
    checksForTitle(defs, "Supervisor").map((d) => d.key),
    ["spot_check", "lead_the_leader", "audit"],
  );
});
