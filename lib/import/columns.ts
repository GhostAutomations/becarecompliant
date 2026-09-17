import "server-only";

/**
 * Be Care Compliant — bulk import column plan.
 *
 * Single source of truth for the import columns, shared by the template generator
 * and the CSV parser so they can never drift.
 *
 * THE TEMPLATE IS THE MATRIX (Phil, 2026-09-17). Identity first - who this is - then every
 * check as the register draws it: a Due column and a Done column, named as the register
 * names them, numbered as the register numbers them. Then the tracker fields, under their
 * register headings too. A filled sheet reads straight across against the register it is
 * about to become.
 */

import { createClient } from "@/lib/supabase/server";
/* The header shapes live in an importless module so they can be unit tested without a
   database. See that file for why every completion now carries a due date beside it. */
import { ROTATION_SLOTS, checkHeaderPlan, intervalDays, type CheckSlot } from "./check-columns";
import { getSupervisionCycleMode } from "@/lib/people/data";

export { ROTATION_SLOTS, intervalDays };

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
  /** Numbered, rotating slots (Supervision, Review) rather than a single pair. */
  isHistory: boolean;
  /** A one off: the date in its Due column IS that instance's deadline, done or not. */
  isOneOff: boolean;
  /** One (Due, Done) pair per slot, in register order. */
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
  { header: "Job Title", field: "job_title", required: false, kind: "text" },
  { header: "Team", field: "team", required: false, kind: "text" },
  { header: "Start date", field: "start_date", required: false, kind: "date" },
  { header: "Email", field: "work_email", required: false, kind: "text" },
  { header: "Mobile", field: "mobile", required: false, kind: "text" },
  { header: "SCW number", field: "scw_registration_number", required: false, kind: "text" },
];

const PEOPLE_DOCUMENTS: DocumentField[] = [
  { header: "DBS", column: "dbs_date", kind: "date" },
  { header: "Enhanced DBS", column: "enhanced_dbs_date", kind: "date" },
  { header: "RTW Expiry", column: "rtw_expiry_date", kind: "date" },
  { header: "RTW Limits", column: "rtw_limits", kind: "text" },
  { header: "Probation End Due", column: "probation_end_due", kind: "date" },
  { header: "Probation End Actual", column: "probation_end_actual", kind: "date" },
  { header: "Probation Status", column: "probation_status", kind: "text" },
];

const SU_IDENTITY: IdentityField[] = [
  { header: "Full name*", field: "full_name", required: true, kind: "text" },
  { header: "Branch*", field: "branch_id", required: true, kind: "branch" },
  { header: "SSID", field: "ssid", required: false, kind: "text" },
  { header: "Package Start Date", field: "package_start_date", required: false, kind: "date" },
];

export async function buildColumnPlan(
  companyId: string,
  population: "people" | "service_users",
): Promise<ColumnPlan> {
  const supabase = await createClient();
  const supervisionSlots =
    population === "people" && (await getSupervisionCycleMode(companyId)) === "four_supervisions"
      ? 4
      : 3;
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
    /* Supervision runs three slots or four depending on the company's cycle mode, and the
       register draws exactly that many. The template follows it rather than guessing. */
    const rotation = d.key === "supervision" ? supervisionSlots : ROTATION_SLOTS;
    const plan = checkHeaderPlan(
      d.key,
      d.name,
      d.recurring,
      intervalDays(d.frequency, d.interval),
      rotation,
    );
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
