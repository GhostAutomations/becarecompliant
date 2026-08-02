import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Training and the Registered roles: the app and the database must agree about who gets in.
 *
 * THE FAULT THIS PINS, found 2026-07-29 and fixed by 0165. A Registered Individual and a
 * Registered Manager are offered the Training page by the nav, by the page's own ALLOWED list and
 * by saveTraining's role check, and RLS then handed them nothing: training_courses_select named
 * is_company_admin and is_company_manager, neither of which covers a Registered role. No courses
 * means no columns, so the page was blank and the dashboard's training percentage was built from
 * an empty matrix. The same oversight as 0150 and 0081, for the third time.
 *
 * Nothing here can execute RLS, so it asserts the two halves say the same thing. That is exactly
 * the half that was wrong: each side was internally consistent and they disagreed with each other.
 */

const migration = readFileSync(
  new URL("../../supabase/migrations/0165_training_visible_to_registered_roles.sql", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../../app/(app)/people/training/page.tsx", import.meta.url),
  "utf8",
);
const nav = readFileSync(new URL("../nav.ts", import.meta.url), "utf8");
const actions = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");

/** The body of one `create policy <name> ... ;` statement, so an assertion cannot be satisfied
 *  by a different policy that happens to sit in the same file. */
function policy(name: string): string {
  const start = migration.indexOf(`create policy ${name} on`);
  assert.notEqual(start, -1, `0165 no longer creates a policy called ${name}`);
  const end = migration.indexOf(";", start);
  return migration.slice(start, end);
}

const REGISTERED = ["registered_individual", "registered_manager"];

test("every policy 0165 creates is dropped first, so the file can be replayed", () => {
  // create policy has no `if not exists` form: without the drop, a replay onto a fresh project
  // aborts with 42710 and takes the rest of the transaction with it.
  const created = [...migration.matchAll(/create policy (\w+) on/g)].map((m) => m[1]);
  assert.ok(created.length >= 4, "expected 0165 to create at least four policies");
  for (const name of created) {
    assert.ok(
      migration.includes(`drop policy if exists ${name} on`),
      `${name} is created without a drop policy if exists in front of it`,
    );
  }
});

test("the course catalogue is readable by the company wide roles", () => {
  // is_company_wide is company_admin + registered_individual + registered_manager. Naming it is
  // the whole fix: without it a Registered Manager sees no courses and the matrix has no columns.
  const p = policy("training_courses_select");
  assert.match(p, /is_company_wide\(company_id\)/);
  // Branch managers keep their access.
  assert.match(p, /is_company_manager\(company_id\)/);
});

test("a person's training does not depend on the row having a branch", () => {
  // It worked by accident: is_branch_manager falls through to is_company_wide internally, and
  // every row happens to carry a branch. A person with no branch would have been invisible to
  // the very roles that cover the whole company.
  for (const name of ["person_training_select", "person_training_write"]) {
    const p = policy(name);
    assert.match(p, /is_company_wide\(company_id\)/, `${name} must not rely on a branch`);
    assert.match(p, /branch_id is not null and public\.is_branch_manager\(branch_id\)/, `${name} must keep branch managers scoped`);
  }
});

test("check definitions can be updated by a Registered Manager", () => {
  // Found in passing, same shape, not on the list: admin or manager only, so a Registered
  // Manager could open a check definition the app offered and not save it.
  assert.match(policy("check_definitions_update"), /is_company_wide\(company_id\)/);
});

test("0165 does NOT widen who can change the course catalogue", () => {
  // Deliberate: training_courses_write stays Admins only, matching saveCourse's own guard.
  // Widening it is a permissions decision for Phil, not a bug fix to slip in here.
  assert.ok(
    !migration.includes("create policy training_courses_write"),
    "0165 must not touch training_courses_write",
  );
  assert.match(actions, /Only Admins can change training courses/);
});

test("the app and the database admit the same roles to Training", () => {
  // The page, the nav entry and the save action all name the Registered roles. If one of them
  // ever stops, this test says so rather than a Registered Manager finding a blank screen.
  for (const role of REGISTERED) {
    assert.ok(page.includes(role), `the Training page's ALLOWED list no longer names ${role}`);
    assert.ok(nav.includes(role), `lib/nav.ts no longer names ${role}`);
    assert.ok(actions.includes(role), `saveTraining no longer names ${role}`);
  }
});
