import "server-only";

/**
 * Be Care Compliant — Absence (People extension) server data access.
 * Reads go through the RLS-scoped user client: person_absence_summary is a
 * security_invoker view, so a Manager only ever sees their own branch, a
 * Supervisor their caseload, a Team Member their own record.
 */

import { createClient } from "@/lib/supabase/server";
import {
  deriveAbsenceStatus,
  resolveAbsenceConfig,
  type AbsenceConfig,
  type AbsenceStatus,
} from "./logic";

export type AbsenceConfigRow = {
  company_id: string;
  method: string;
  rolling_window_days: number;
  thresholds: unknown;
  policy_path: string | null;
  policy_uploaded_at: string | null;
  policy_ai_summary: string | null;
  updated_at: string | null;
};

export async function getAbsenceConfigRow(
  companyId: string,
): Promise<AbsenceConfigRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("absence_config")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  return (data as AbsenceConfigRow | null) ?? null;
}

export async function getAbsenceConfig(companyId: string): Promise<AbsenceConfig> {
  return resolveAbsenceConfig(await getAbsenceConfigRow(companyId));
}

export type AbsencePersonRow = {
  personId: string;
  fullName: string;
  branchId: string | null;
  occasions: number;
  totalDays: number;
  firstAbsence: string | null;
  lastAbsence: string | null;
  status: AbsenceStatus;
};

type SummaryRow = {
  company_id: string;
  person_id: string;
  full_name: string;
  branch_id: string | null;
  occasions: number;
  total_days: number;
  first_absence: string | null;
  last_absence: string | null;
  latest_meeting_stage: number | null;
};

/** The Absence register: only active people who HAVE absences in the window. */
export async function listAbsenceRegister(
  companyId: string,
  branchId?: string | null,
): Promise<{ config: AbsenceConfig; rows: AbsencePersonRow[] }> {
  const supabase = await createClient();
  const config = await getAbsenceConfig(companyId);

  let query = supabase
    .from("person_absence_summary")
    .select("*")
    .eq("company_id", companyId)
    .order("full_name", { ascending: true });
  if (branchId) query = query.eq("branch_id", branchId);

  const { data } = await query;
  const rows = ((data as SummaryRow[] | null) ?? []).map((r) => ({
    personId: r.person_id,
    fullName: r.full_name,
    branchId: r.branch_id,
    occasions: r.occasions,
    totalDays: Number(r.total_days),
    firstAbsence: r.first_absence,
    lastAbsence: r.last_absence,
    status: deriveAbsenceStatus(
      {
        occasions: r.occasions,
        totalDays: Number(r.total_days),
        latestMeetingStage: r.latest_meeting_stage,
      },
      config,
    ),
  }));

  return { config, rows };
}

export type PersonLite = { id: string; full_name: string; branch_id: string | null };

/** Active people (RLS-scoped) for the "record an absence" person picker. */
export async function listActivePeople(companyId: string): Promise<PersonLite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("people")
    .select("id, full_name, branch_id")
    .eq("company_id", companyId)
    .eq("employment_status", "active")
    .is("archived_at", null)
    .order("full_name", { ascending: true });
  return (data as PersonLite[] | null) ?? [];
}

export type AbsenceEventRow = {
  id: string;
  person_id: string;
  start_date: string;
  end_date: string | null;
  return_date: string | null;
  days: number | null;
  reason: string | null;
  evidence_id: string | null;
  created_at: string;
};

/** All absence events for the company's people (RLS-scoped), for the Absence
 *  view's "View absence" panels. Grouped by person on the client. */
export async function listAbsenceEvents(
  companyId: string,
  branchId?: string | null,
): Promise<AbsenceEventRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("absence_events")
    .select("id, person_id, start_date, end_date, return_date, days, reason, evidence_id, created_at")
    .eq("company_id", companyId)
    .order("start_date", { ascending: false });
  if (branchId) query = query.eq("branch_id", branchId);
  const { data } = await query;
  return (data as AbsenceEventRow[] | null) ?? [];
}

export async function listPersonAbsences(
  personId: string,
): Promise<AbsenceEventRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("absence_events")
    .select("*")
    .eq("person_id", personId)
    .order("start_date", { ascending: false });
  return (data as AbsenceEventRow[] | null) ?? [];
}

export type AbsenceMeetingRow = {
  id: string;
  person_id: string;
  stage: number | null;
  meeting_date: string | null;
  evidence_id: string | null;
  created_at: string;
};

export async function listPersonMeetings(
  personId: string,
): Promise<AbsenceMeetingRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("absence_meetings")
    .select("*")
    .eq("person_id", personId)
    .order("meeting_date", { ascending: false });
  return (data as AbsenceMeetingRow[] | null) ?? [];
}
