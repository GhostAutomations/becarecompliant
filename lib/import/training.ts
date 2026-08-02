import "server-only";

/**
 * Be Care Compliant - bulk import of TRAINING records.
 *
 * A COLUMN PER COURSE, one row per carer (Phil, 2026-08-01), because that is the shape a care
 * company's training matrix already comes in: it is what his own Training.xlsx held and what the
 * first 518 records were built from.
 *
 * THE CELL HOLDS THE RENEWAL DATE for a recurring course, and the completion is worked back from
 * it. That is deliberate and it is not the same as the rest of the app, which is completion
 * first: a matrix kept by a registered manager records when a certificate RUNS OUT, because that
 * is the date she is managing. The column header says which it wants so nobody has to guess.
 *
 * IT NEVER CREATES A CARER. Training attaches to somebody already on the register, matched on
 * name within a branch. A name that is not there is an error on the preview, not a new person:
 * an import that quietly invents staff is worse than one that refuses.
 *
 * UNKNOWN AND MISSING COLUMNS ARE REPORTED. Phil asked the right question on 2026-08-01: what
 * happens to a template downloaded before somebody renames a course? In the People importer the
 * answer was nothing at all, silently, because an unrecognised header simply reads as empty. Here
 * both directions are named on the preview before a single row is written.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { parseCsv, toIso, type ParsedRow } from "./parse";
import {
  deriveCompletedDate,
  trainingHeader,
  normaliseHeader,
  classifyHeaders,
} from "@/lib/training/renewal";

export const TRAINING_IDENTITY = ["Full name*", "Branch*"] as const;

/** Words a one off course accepts in its column, besides a date. */
const DONE_WORDS = new Set(["completed", "complete", "done", "yes", "y", "x", "✓", "true"]);

export type TrainingCourseColumn = {
  id: string;
  name: string;
  renewalMonths: number | null;
  header: string;
};

export type TrainingColumnPlan = {
  courses: TrainingCourseColumn[];
  headers: string[];
};

export async function buildTrainingColumnPlan(companyId: string): Promise<TrainingColumnPlan> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_courses")
    .select("id, name, renewal_months, sort_order")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  const courses: TrainingCourseColumn[] = (
    (data as Array<{ id: string; name: string; renewal_months: number | null }> | null) ?? []
  ).map((c) => ({
    id: c.id,
    name: c.name,
    renewalMonths: c.renewal_months,
    header: trainingHeader(c.name, c.renewal_months),
  }));

  return { courses, headers: [...TRAINING_IDENTITY, ...courses.map((c) => c.header)] };
}

function csvCell(v: string): string {
  return /["\r\n,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export async function buildTrainingTemplate(
  companyId: string,
): Promise<{ columns: string[]; csv: string; filename: string }> {
  const { headers } = await buildTrainingColumnPlan(companyId);
  return {
    columns: headers,
    csv: `${headers.map(csvCell).join(",")}\r\n`,
    filename: "bcc-training-import-template.csv",
  };
}

export type TrainingValidateResult =
  | { ok: false; error: string }
  | {
      ok: true;
      population: "training";
      rows: ParsedRow[];
      counts: { new: number; duplicate: number; error: number };
      /** Columns in the file we do not recognise, and columns we expected and did not find. */
      unknownColumns: string[];
      missingColumns: string[];
    };

export async function validateTrainingImport(
  companyId: string,
  csvText: string,
): Promise<TrainingValidateResult> {
  const plan = await buildTrainingColumnPlan(companyId);
  if (plan.courses.length === 0) {
    return { ok: false, error: "No training courses are set up yet. Add them in Settings, People, Training courses." };
  }

  const grid = parseCsv(csvText).filter((r) => r.some((c) => c.trim() !== ""));
  if (grid.length === 0) return { ok: false, error: "That file has no rows." };

  const header = grid[0].map((h) => h.trim());
  const colIndex = new Map<string, number>();
  header.forEach((h, i) => {
    const k = normaliseHeader(h);
    if (k && !colIndex.has(k)) colIndex.set(k, i);
  });

  for (const req of TRAINING_IDENTITY) {
    if (!colIndex.has(normaliseHeader(req))) {
      return { ok: false, error: `The file is missing the required column "${req}". Use the downloaded template.` };
    }
  }

  /*
   * THE STALE TEMPLATE CHECK. A file downloaded before a course was renamed carries the old
   * heading, and matching by name alone would skip it without a word. Both directions are
   * collected and shown before anything is committed.
   */
  const { unknown: unknownColumns } = classifyHeaders(header, [
    ...TRAINING_IDENTITY,
    ...plan.courses.map((c) => c.header),
  ]);
  // Only the COURSE columns count as missing: the identity ones are required and already refused.
  const { missing: missingColumns } = classifyHeaders(header, plan.courses.map((c) => c.header));

  const supabase = await createClient();
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("status", "active");

  /*
   * PAGED. PostgREST caps a response at 1000 rows and says nothing about it. Unpaged, carer 1001
   * onwards would be reported as "not on the register", which reads as a data error and invites
   * an admin to add duplicate people to "fix" it.
   */
  const peopleRows: Array<{ id: string; full_name: string; branch_id: string | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("people")
      .select("id, full_name, branch_id")
      .eq("company_id", companyId)
      .is("archived_at", null)
      .neq("employment_status", "leaver")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) return { ok: false, error: `The register could not be read: ${error.message}` };
    const page = (data as typeof peopleRows | null) ?? [];
    peopleRows.push(...page);
    if (page.length < 1000) break;
  }

  const branchByName = new Map<string, string>();
  for (const b of (branches as Array<{ id: string; name: string }> | null) ?? []) {
    branchByName.set(b.name.trim().toLowerCase(), b.id);
  }

  /*
   * TWO CARERS WITH THE SAME NAME IN ONE BRANCH ARE NOT GUESSED BETWEEN. Overwriting the map
   * would have silently attached one carer's certificates to the other, which is a compliance
   * record on the wrong person and no way to notice.
   */
  const personByKey = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const p of peopleRows) {
    if (!p.branch_id) continue;
    const key = `${p.full_name.trim().toLowerCase()}|${p.branch_id}`;
    if (personByKey.has(key)) ambiguous.add(key);
    else personByKey.set(key, p.id);
  }

  const cell = (cols: string[], headerName: string): string => {
    const idx = colIndex.get(normaliseHeader(headerName));
    return idx === undefined ? "" : (cols[idx] ?? "").trim();
  };

  const rows: ParsedRow[] = [];
  /*
   * A carer listed twice in the same file. Both rows would flat map into one upsert carrying the
   * same (person, course) pair, and Postgres refuses that outright: "ON CONFLICT DO UPDATE cannot
   * affect row a second time" takes the WHOLE batch of 500 with it. A repeated name in a
   * spreadsheet is an everyday thing, so it is caught here and named on the row.
   */
  const seen = new Set<string>();
  for (let r = 1; r < grid.length; r++) {
    const cols = grid[r];
    const errors: string[] = [];
    const name = cell(cols, "Full name*");
    const branchName = cell(cols, "Branch*");

    if (!name) errors.push("Full name is required.");
    let branchId: string | null = null;
    if (!branchName) errors.push("Branch is required.");
    else {
      branchId = branchByName.get(branchName.toLowerCase()) ?? null;
      if (!branchId) errors.push(`Branch "${branchName}" is not one of your branches.`);
    }

    let personId: string | null = null;
    if (name && branchId) {
      const key = `${name.toLowerCase()}|${branchId}`;
      if (ambiguous.has(key)) {
        errors.push(`More than one ${name} is on the register in ${branchName}, so this row cannot be matched to one of them.`);
      } else {
        personId = personByKey.get(key) ?? null;
        // Training belongs to somebody already on the register. Inventing a carer from a training
        // file would create staff nobody added, with no start date and no employment record.
        if (!personId) errors.push(`${name} is not on the register in ${branchName}. Add them first.`);
      }
    }

    const checks: ParsedRow["checks"] = [];
    for (const c of plan.courses) {
      const raw = cell(cols, c.header);
      if (!raw) continue;

      if (c.renewalMonths == null) {
        // One off: a word, or a date, both mean done. The date is kept when there is one.
        const iso = toIso(raw);
        if (iso === "INVALID") {
          if (!DONE_WORDS.has(raw.toLowerCase())) {
            errors.push(`${c.header}: enter Completed, or the date it was done.`);
            continue;
          }
          checks.push({ definitionId: c.id, name: c.name, dates: [] });
        } else if (iso) {
          checks.push({ definitionId: c.id, name: c.name, dates: [iso] });
        }
        continue;
      }

      const iso = toIso(raw);
      if (iso === "INVALID") {
        errors.push(`${c.header} is not a valid date (use DD/MM/YYYY).`);
        continue;
      }
      if (iso) checks.push({ definitionId: c.id, name: c.name, dates: [iso] });
    }

    if (errors.length === 0 && checks.length === 0) {
      errors.push("Nothing to import on this row: every course column is blank.");
    }
    if (errors.length === 0 && personId) {
      if (seen.has(personId)) errors.push(`${name} appears more than once in this file.`);
      else seen.add(personId);
    }

    rows.push({
      row: r + 1,
      name,
      branchName,
      branchId,
      fields: { person_id: personId },
      docs: {},
      checks,
      status: errors.length > 0 ? "error" : "new",
      errors,
    });
  }

  const counts = {
    new: rows.filter((x) => x.status === "new").length,
    duplicate: 0,
    error: rows.filter((x) => x.status === "error").length,
  };

  return { ok: true, population: "training", rows, counts, unknownColumns, missingColumns };
}

export type TrainingCommitResult = { written: number; carers: number; failures: string[] };

/**
 * How many person_training rows a validated file will write. The preview counts CARERS; the
 * button must not then claim that number of RECORDS when each carer writes one per course.
 *
 * NOT imported by the uploader, which counts the same thing inline. This module is server-only,
 * and a value import of it from a client component throws at runtime while typechecking
 * perfectly, which is a failure that reaches production rather than a build.
 */
export function trainingRecordCount(rows: ParsedRow[]): number {
  return rows.filter((r) => r.status === "new").reduce((n, r) => n + r.checks.length, 0);
}

/**
 * Write the rows the preview accepted. Service role, because the preview has already resolved
 * every person through the USER's client: a carer the importer could not see never reaches here.
 */
export async function commitTrainingImport(
  companyId: string,
  rows: ParsedRow[],
  actorId: string,
): Promise<TrainingCommitResult> {
  const good = rows.filter((r) => r.status === "new" && r.fields.person_id && r.branchId);
  if (good.length === 0) return { written: 0, carers: 0, failures: [] };

  const plan = await buildTrainingColumnPlan(companyId);
  const renewalById = new Map(plan.courses.map((c) => [c.id, c.renewalMonths]));

  /*
   * WHAT IS ALREADY THERE IS READ FIRST, so an import cannot BLANK a date the company had.
   *
   * A one off column that simply says "Completed" carries no date. Writing that straight in would
   * null the completion somebody had already entered by hand, which is data destroyed by an
   * import that reported success. Where the file has nothing to say, the existing value stands.
   */
  const supabaseRead = createServiceClient();
  const existing = new Map<string, { completed_on: string | null; expiry_on: string | null }>();
  const personIds = [...new Set(good.map((r) => r.fields.person_id as string))];
  for (let i = 0; i < personIds.length; i += 200) {
    const { data } = await supabaseRead
      .from("person_training")
      .select("person_id, course_id, completed_on, expiry_on")
      .eq("company_id", companyId)
      .in("person_id", personIds.slice(i, i + 200));
    for (const row of (data as Array<{
      person_id: string;
      course_id: string;
      completed_on: string | null;
      expiry_on: string | null;
    }> | null) ?? []) {
      existing.set(`${row.person_id}|${row.course_id}`, {
        completed_on: row.completed_on,
        expiry_on: row.expiry_on,
      });
    }
  }

  const now = new Date().toISOString();
  const payload = good.flatMap((r) =>
    r.checks.map((c) => {
      const renewal = renewalById.get(c.definitionId) ?? null;
      const dated = c.dates[0] ?? null;
      const was = existing.get(`${r.fields.person_id}|${c.definitionId}`);
      // A recurring cell holds the RENEWAL date, so the completion is worked back from it. A one
      // off cell holds a completion, or nothing at all when it just said "Completed".
      const expiryOn = renewal != null ? dated : (was?.expiry_on ?? null);
      const completedOn =
        renewal != null && dated
          ? deriveCompletedDate(dated, renewal)
          : (dated ?? was?.completed_on ?? null);
      return {
        company_id: companyId,
        branch_id: r.branchId,
        person_id: r.fields.person_id as string,
        course_id: c.definitionId,
        status: "completed",
        completed_on: completedOn,
        expiry_on: expiryOn,
        updated_by: actorId,
        updated_at: now,
      };
    }),
  );

  const supabase = createServiceClient();
  const failures: string[] = [];
  let written = 0;
  const carersWritten = new Set<string>();
  const PER_REQUEST = 500;
  for (let i = 0; i < payload.length; i += PER_REQUEST) {
    const batch = payload.slice(i, i + PER_REQUEST);
    const { error } = await supabase
      .from("person_training")
      .upsert(batch, { onConflict: "person_id,course_id" });
    if (error) {
      failures.push(error.message);
      continue;
    }
    written += batch.length;
    // Counted from what was WRITTEN, not from what was attempted: a message that names sixty
    // carers when a batch failed is a message nobody can act on.
    for (const row of batch) carersWritten.add(row.person_id);
  }

  return { written, carers: carersWritten.size, failures };
}
