import "server-only";

/**
 * Be Care Compliant — bulk import column plan.
 *
 * Single source of truth for the import columns, shared by the template generator
 * and the CSV parser so they can never drift. Built per company from its own active
 * check definitions: identity fields, a dated column (or up to 8 for Supervision /
 * Care Plan Review) per check, and the fixed tracker/document fields.
 */

import { createClient } from "@/lib/supabase/server";
/* The header shapes live in an importless module so they can be unit tested without a
   database. See that file for why every completion now carries a due date beside it. */
import { HISTORY_CAP, checkHeaderPlan, intervalDays, type CheckSlot } from "./check-columns";

export { HISTORY_CAP, intervalDays };

export type IdentityField = {
  header: string;
  field: string;
  required: boolean;
  kind: "text" | "date" | "branch";
};

export type CheckColumn = {
  definitionId: string;
  key: string;
  name: string;
  /** The open check's due date, supplied instead of calculated. Null for a one off. */
  nextDueHeader: string | null;
  /** One (due, completed) pair per remembered completion, newest first. */
  slots: CheckSlot[];
  /** Every header this check contributes, in file order. */
  headers: string[];
};

export type DocumentField = { header: string; column: string; kind: "date" | "text" };

export type ColumnPlan = {
  identity: IdentityField[];
  checks: CheckColumn[];
  documents: DocumentField[];
  headers: string[];
};

const PEOPLE_IDENTITY: IdentityField[] = [
  { header: "Full name*", field: "full_name", required: true, kind: "text" },
  { header: "Branch*", field: "branch_id", required: true, kind: "branch" },
  { header: "Job title", field: "job_title", required: false, kind: "text" },
  { header: "Team", field: "team", required: false, kind: "text" },
  { header: "Start date", field: "start_date", required: false, kind: "date" },
  { header: "Email", field: "work_email", required: false, kind: "text" },
  { header: "Mobile", field: "mobile", required: false, kind: "text" },
  { header: "SCW number", field: "scw_registration_number", required: false, kind: "text" },
];

const PEOPLE_DOCUMENTS: DocumentField[] = [
  { header: "DBS date", column: "dbs_date", kind: "date" },
  { header: "Enhanced DBS date", column: "enhanced_dbs_date", kind: "date" },
  { header: "Right to Work expiry", column: "rtw_expiry_date", kind: "date" },
  { header: "Right to Work limits", column: "rtw_limits", kind: "text" },
  { header: "Probation end due", column: "probation_end_due", kind: "date" },
  { header: "Probation end actual", column: "probation_end_actual", kind: "date" },
  { header: "Probation status", column: "probation_status", kind: "text" },
];

const SU_IDENTITY: IdentityField[] = [
  { header: "Full name*", field: "full_name", required: true, kind: "text" },
  { header: "Branch*", field: "branch_id", required: true, kind: "branch" },
  { header: "SSID", field: "ssid", required: false, kind: "text" },
  { header: "Package start date", field: "package_start_date", required: false, kind: "date" },
];

export async function buildColumnPlan(
  companyId: string,
  population: "people" | "service_users",
): Promise<ColumnPlan> {
  const supabase = await createClient();
  const { data: defs } = await supabase
    .from("check_definitions")
    .select("id, key, name, recurring, frequency, interval, sort_order")
    .eq("company_id", companyId)
    .eq("population", population)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  const checks: CheckColumn[] = ((defs as Array<{
    id: string;
    key: string;
    name: string;
    recurring: boolean;
    frequency: string | null;
    interval: number | null;
  }> | null) ?? []).map((d) => {
    const plan = checkHeaderPlan(d.key, d.name, d.recurring, intervalDays(d.frequency, d.interval));
    return { definitionId: d.id, key: d.key, name: d.name, ...plan };
  });

  const identity = population === "people" ? PEOPLE_IDENTITY : SU_IDENTITY;
  const documents = population === "people" ? PEOPLE_DOCUMENTS : [];

  const headers = [
    ...identity.map((i) => i.header),
    ...checks.flatMap((c) => c.headers),
    ...documents.map((d) => d.header),
  ];

  return { identity, checks, documents, headers };
}
