import test from "node:test";
import assert from "node:assert/strict";
import { jobTitleOrDefault, DEFAULT_JOB_TITLE } from "./job-title.ts";

const THISTLE = ["Care Assistant", "Senior Care Assistant", "Supervisor", "Registered Manager"];

test("a blank cell becomes Care Assistant", () => {
  assert.equal(jobTitleOrDefault("", THISTLE), "Care Assistant");
  assert.equal(jobTitleOrDefault(null, THISTLE), "Care Assistant");
  assert.equal(jobTitleOrDefault(undefined, THISTLE), "Care Assistant");
  assert.equal(jobTitleOrDefault("   ", THISTLE), "Care Assistant");
});

test("the company's own spelling wins", () => {
  // Otherwise the register grows a second, nearly identical title and the record
  // dropdown marks it "(not in your list)".
  assert.equal(jobTitleOrDefault("", ["care assistant", "Supervisor"]), "care assistant");
  assert.equal(jobTitleOrDefault("", ["  Care assistant  "]), "Care assistant");
});

test("a company with nothing like it still gets the constant", () => {
  assert.equal(jobTitleOrDefault("", ["Support Worker", "Nurse"]), DEFAULT_JOB_TITLE);
  assert.equal(jobTitleOrDefault("", []), DEFAULT_JOB_TITLE);
});

test("a title the sheet gives is kept exactly, case and all", () => {
  // Never corrected: "Care Assistant (Nights)" is a real title, not a typo.
  assert.equal(jobTitleOrDefault("Senior Care Assistant", THISTLE), "Senior Care Assistant");
  assert.equal(jobTitleOrDefault("care worker", THISTLE), "care worker");
  assert.equal(jobTitleOrDefault("Care Assistant (Nights)", THISTLE), "Care Assistant (Nights)");
  assert.equal(jobTitleOrDefault("  Supervisor  ", THISTLE), "Supervisor");
});
