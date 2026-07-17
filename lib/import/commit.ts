import "server-only";

/**
 * Be Care Compliant — bulk import commit.
 *
 * For each NEW row: create the record (reusing the same insert + apply-checks path
 * as the one-at-a-time flow), stamp tracker/document dates, then seed each check's
 * completed dates via seed_migrated_completion (newest date advances the check with
 * a recurrence-calculated next due and no evidence = "migrated, no form on file";
 * older dates are recorded as history). Existing rows are skipped and errored rows
 * are reported (both surfaced in the in-app summary + admin email). Checks that
 * legitimately carry no due date (e.g. an appraisal scheduled off the supervision
 * cycle) are left as-is, not flagged, since that is normal for this company.
 */

import { createClient } from "@/lib/supabase/server";
import { parseCivilDate } from "@/lib/recurrence";
import type { CheckDefinition } from "@/lib/people/types";
import { listPeopleCheckDefinitions } from "@/lib/people/data";
import { listServiceUserCheckDefinitions } from "@/lib/service-users/data";
import {
  initialDueDate as peopleInitialDue,
  nextDueAfterCompletion,
} from "@/lib/people/logic";
import { initialDueDate as suInitialDue } from "@/lib/service-users/logic";
import type { ParsedRow } from "./parse";

export type ImportFlags = {
  skipped: string[];
  errored: Array<{ name: string; errors: string[] }>;
};

export type CommitResult = { created: number } & ImportFlags;

/** Seed a record's migrated check dates. The newest date advances the check (with a
 *  recurrence-calculated next due, evidence null = migrated); all dates are kept as
 *  history. Checks that legitimately carry no due date (e.g. an appraisal scheduled
 *  off the supervision cycle) are left as-is, not flagged. */
async function seedRowChecks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recordType: "person" | "service_user",
  recordId: string,
  row: ParsedRow,
  defById: Map<string, CheckDefinition>,
  supInterval: number,
): Promise<void> {
  for (const c of row.checks) {
    const def = defById.get(c.definitionId);
    if (!def || c.dates.length === 0) continue;
    // c.dates is newest-first. The newest advances the check; all are kept as history.
    const { nextDue } = nextDueAfterCompletion(def, {}, supInterval, parseCivilDate(c.dates[0]));
    for (let i = 0; i < c.dates.length; i++) {
      await supabase.rpc("seed_migrated_completion", {
        p_record_type: recordType,
        p_record_id: recordId,
        p_definition_id: def.id,
        p_completed_on: c.dates[i],
        p_next_due: i === 0 ? nextDue : null,
        p_is_latest: i === 0,
      });
    }
  }
}

export async function commitPeople(
  companyId: string,
  userId: string,
  rows: ParsedRow[],
): Promise<CommitResult> {
  const supabase = await createClient();
  const defs = await listPeopleCheckDefinitions(companyId);
  const defById = new Map(defs.map((d) => [d.id, d]));
  const supInterval = defs.find((d) => d.key === "supervision")?.interval ?? 90;

  let created = 0;
  const flags: ImportFlags = { skipped: [], errored: [] };

  for (const row of rows) {
    const label = row.name || `Row ${row.row}`;
    if (row.status === "duplicate") {
      flags.skipped.push(label);
      continue;
    }
    if (row.status === "error") {
      flags.errored.push({ name: label, errors: row.errors });
      continue;
    }
    if (!row.branchId) {
      flags.errored.push({ name: label, errors: ["Branch could not be matched."] });
      continue;
    }

    const { data: person, error } = await supabase
      .from("people")
      .insert({
        company_id: companyId,
        branch_id: row.branchId,
        full_name: row.name,
        job_title: row.fields.job_title ?? null,
        work_email: row.fields.work_email ?? null,
        mobile: row.fields.mobile ?? null,
        team: row.fields.team ?? null,
        start_date: row.fields.start_date ?? null,
        scw_registration_number: row.fields.scw_registration_number ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error || !person) {
      flags.errored.push({ name: label, errors: [error?.message ?? "Could not create the record."] });
      continue;
    }

    const applyRows = defs.map((def) => ({
      definition_id: def.id,
      due_date: peopleInitialDue(def, row.fields.start_date ?? null),
      expiry_date: null,
    }));
    await supabase.rpc("apply_person_checks", { p_person_id: person.id, p_rows: applyRows });

    const patch: Record<string, unknown> = { updated_by: userId };
    for (const [col, val] of Object.entries(row.docs)) if (val != null) patch[col] = val;
    if (Object.keys(patch).length > 1) {
      await supabase.from("person_trackers").update(patch).eq("person_id", person.id);
    }

    await seedRowChecks(supabase, "person", person.id, row, defById, supInterval);
    created += 1;
  }
  return { created, ...flags };
}

export async function commitServiceUsers(
  companyId: string,
  userId: string,
  rows: ParsedRow[],
): Promise<CommitResult> {
  const supabase = await createClient();
  const defs = await listServiceUserCheckDefinitions(companyId);
  const defById = new Map(defs.map((d) => [d.id, d]));

  let created = 0;
  const flags: ImportFlags = { skipped: [], errored: [] };

  for (const row of rows) {
    const label = row.name || `Row ${row.row}`;
    if (row.status === "duplicate") {
      flags.skipped.push(label);
      continue;
    }
    if (row.status === "error") {
      flags.errored.push({ name: label, errors: row.errors });
      continue;
    }
    if (!row.branchId) {
      flags.errored.push({ name: label, errors: ["Branch could not be matched."] });
      continue;
    }

    const { data: su, error } = await supabase
      .from("service_users")
      .insert({
        company_id: companyId,
        branch_id: row.branchId,
        full_name: row.name,
        ssid: row.fields.ssid ?? null,
        package_start_date: row.fields.package_start_date ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error || !su) {
      flags.errored.push({ name: label, errors: [error?.message ?? "Could not create the record."] });
      continue;
    }

    const applyRows = defs.map((def) => ({
      definition_id: def.id,
      due_date: suInitialDue(def, row.fields.package_start_date ?? null),
      expiry_date: null,
    }));
    await supabase.rpc("apply_service_user_checks", { p_service_user_id: su.id, p_rows: applyRows });

    await seedRowChecks(supabase, "service_user", su.id, row, defById, 90);
    created += 1;
  }
  return { created, ...flags };
}
