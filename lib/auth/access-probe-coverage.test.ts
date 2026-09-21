/**
 * Every department a Supervisor or a Recruiter can open is probed against the live database.
 *
 * WHY THIS TEST EXISTS (Phil, 2026-09-21): "They need access to this, if the boxes are checked in
 * the access tiles they should be able to do it. I don't want to have to keep coming back to fix
 * things. This looks bad when Thistle is reporting issues."
 *
 * Four times now a department has been ticked for a role on screen and refused underneath by RLS
 * (DEF-023, DEF-028, DEF-031, DEF-032), and every one of those was found by a person filling in a
 * form and being told no. scripts/access-probe.sql is what finds them instead: it signs in as a
 * real Supervisor and TRIES each thing, rolling every attempt back.
 *
 * A script nobody remembers to update is no better than no script, so this test is the part that
 * cannot be forgotten: add a department to the ceiling for a branch scoped role, and `npm test`
 * fails until the probe has an attempt for it. It checks COVERAGE, not permissions -- only the
 * database can answer those, and the probe is how it is asked.
 *
 * NOT PROBED, and listed here rather than left to be guessed at:
 *  - Dashboard, which has no records of its own; it reads other departments' and is covered by
 *    each of them.
 *  - Team Portal, which belongs to a carer's own login, not to an office role.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MODULES } from "./module-catalogue.ts";

const PROBE = "scripts/access-probe.sql";

/** Departments with nothing of their own for a probe to write or read. */
const NOT_PROBED = new Set(["dashboard", "team_portal"]);

test("every department a Supervisor or Recruiter can open has an attempt in the access probe", () => {
  const sql = readFileSync(new URL(`../../${PROBE}`, import.meta.url), "utf8");
  const missing = MODULES.filter(
    (m) =>
      !NOT_PROBED.has(m.key) &&
      (m.roles.includes("supervisor") || m.roles.includes("recruiter")) &&
      !sql.includes(`('${m.label}',`),
  ).map((m) => m.label);
  assert.deepEqual(
    missing,
    [],
    `${missing.join(", ")} is ticked for a branch scoped role but never tried in ${PROBE}. ` +
      "Add an attempt for it, or the first person to find out will be the customer.",
  );
});

test("the probe also proves what the tiles withhold", () => {
  const sql = readFileSync(new URL(`../../${PROBE}`, import.meta.url), "utf8");
  // A probe that only ever expects "allowed" would pass with RLS switched off altogether.
  for (const label of ["Invoicing", "Whistleblowing", "Settings"]) {
    assert.ok(sql.includes(`('${label}',`), `${PROBE} no longer checks that ${label} is refused.`);
  }
  assert.ok(sql.includes("'blocked'"), `${PROBE} has no attempt that is expected to be refused.`);
});
