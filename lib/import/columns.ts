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

export const HISTORY_CAP = 8;
const HISTORY_KEYS = new Set(["supervision", "care_plan_review"]);

export function intervalDays(frequency: string | null, interval: number | null): number {
  const n = interval && interval > 0 ? interval : 0;
  switch (frequency) {
    case "week":
      return n * 7;
    case "month":
      return n * 30;
    case "year":
      return n * 365;
    default:
      return n;
  }
}

/** Column headers for one check (1 = most recent for the multi-history checks). */
export function checkHeaders(
  key: string,
  name: string,
  recurring: boolean,
  days: number,
): string[] {
  if (recurring && days > 0 && HISTORY_KEYS.has(key)) {
    const n = Math.min(Math.max(1, Math.ceil(730 / days)), HISTORY_CAP);
    if (n > 1) return Array.from({ length: n }, (_, i) => `${name} ${i + 1}`);
  }
  return [`${name} completed date`];
}

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
  }> | null) ?? []).map((d) => ({
    definitionId: d.id,
    key: d.key,
    name: d.name,
    headers: checkHeaders(d.key, d.name, d.recurring, intervalDays(d.frequency, d.interval)),
  }));

  const identity = population === "people" ? PEOPLE_IDENTITY : SU_IDENTITY;
  const documents = population === "people" ? PEOPLE_DOCUMENTS : [];

  const headers = [
    ...identity.map((i) => i.header),
    ...checks.flatMap((c) => c.headers),
    ...documents.map((d) => d.header),
  ];

  return { identity, checks, documents, headers };
}
