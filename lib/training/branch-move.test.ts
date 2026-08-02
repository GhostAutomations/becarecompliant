import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * When a carer moves branch, everything that hangs off them moves too.
 *
 * THE FAULT (Phil, 2026-08-01: "if they swap branch the new manager should get the alerts and the
 * old one stops"). people has had a branch sync trigger since 0004, and it followed
 * check_instances and person_trackers but not person_training. So after a transfer the OLD
 * branch's manager kept the training reminders, the new one got none, and because
 * person_training_select is gated on the same column the new manager's matrix showed that carer
 * as "Not done" on every course.
 *
 * Asserted against the migration text: nothing here can run a trigger, and the failure this
 * guards against is a table being FORGOTTEN, which is exactly what a list can be checked for.
 */

const migration = readFileSync(
  new URL("../../supabase/migrations/0166_training_follows_the_branch_move.sql", import.meta.url),
  "utf8",
);

test("the branch sync follows every per person table, training included", () => {
  const body = migration.slice(
    migration.indexOf("create or replace function public.sync_check_instance_branch"),
    migration.indexOf("comment on function"),
  );
  for (const table of ["check_instances", "person_trackers", "person_training"]) {
    assert.match(
      body,
      new RegExp(`update public\\.${table}\\s+set branch_id = new\\.branch_id`),
      `${table} no longer follows a branch move`,
    );
  }
  // Guarded, so an update that does not touch the branch does no work at all.
  assert.match(body, /if new\.branch_id is distinct from old\.branch_id then/);
});

test("training is not stamped as edited when a person is transferred", () => {
  // check_instances sets updated_at because the instance genuinely changes. A training record
  // does not: stamping it would make the audit trail read as though somebody touched a
  // certificate on the day of a transfer.
  const trainingUpdate = migration.slice(
    migration.indexOf("update public.person_training"),
    migration.indexOf("end if;"),
  );
  assert.ok(!trainingUpdate.includes("updated_at"), "person_training must not be stamped");
  assert.ok(!trainingUpdate.includes("updated_by"), "person_training must not be re-attributed");
});

test("carers who moved BEFORE the fix are brought back into line", () => {
  // Without the backfill the fix only helps people who move from today onwards, and everybody
  // already sitting under the wrong manager stays there.
  assert.match(migration, /update public\.person_training pt\s+set branch_id = p\.branch_id/);
  assert.match(migration, /pt\.branch_id is distinct from p\.branch_id/);
});
