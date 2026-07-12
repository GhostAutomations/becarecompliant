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

export type ConductorLite = { id: string; full_name: string; email: string; role: string };

export type MeetingOffice = { id: string; label: string; hasAddress: boolean; address: string | null };

/** Meeting location options (Phil, 2026-07-12): the company's own office (the
 *  Team branch) labelled "{Company} Office", then each branch labelled
 *  "{Branch} Branch Office". The picked office's address (Settings > Branches)
 *  is printed in full in the formal letters. */
export async function listMeetingOffices(companyId: string): Promise<MeetingOffice[]> {
  const supabase = await createClient();
  const [{ data: company }, { data: branches }] = await Promise.all([
    supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
    supabase
      .from("branches")
      .select("id, name, kind, address")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("kind", { ascending: false }) // team first
      .order("name", { ascending: true }),
  ]);
  const companyName = company?.name ?? "Company";
  return (branches ?? []).map((b) => ({
    id: b.id as string,
    label: b.kind === "team" ? `${companyName} Office` : `${b.name} Branch Office`,
    hasAddress: Boolean(b.address),
    address: (b.address as string | null) ?? null,
  }));
}

/** Active Managers + Company Admins: the only people who can hold a formal
 *  absence meeting (Phil, 2026-07-12). */
export async function listMeetingConductors(companyId: string): Promise<ConductorLite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("company_id", companyId)
    .eq("status", "active")
    .in("role", ["company_admin", "manager"])
    .order("full_name");
  return (data as ConductorLite[] | null) ?? [];
}

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
  meeting_time: string | null;
  duration_minutes: number | null;
  evidence_id: string | null;
  created_at: string;
};

export type OpenBookingRow = {
  id: string;
  person_id: string;
  stage: number | null;
  meeting_date: string | null;
  meeting_time: string | null;
  duration_minutes: number | null;
  location: string | null;
  response: "accepted" | "declined" | null;
  response_reason: string | null;
  conductor_id: string | null;
  conductor_name: string | null;
};

/** Booked absence meetings not yet recorded (evidence_id null), for the cards. */
export async function listOpenBookings(companyId: string): Promise<OpenBookingRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("absence_meetings")
    .select(
      "id, person_id, stage, meeting_date, meeting_time, duration_minutes, location, response, response_reason, conducted_by, conductor:conducted_by(full_name, email)",
    )
    .eq("company_id", companyId)
    .is("evidence_id", null)
    .order("meeting_date", { ascending: true });
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const raw = row.conductor as
      | { full_name: string | null; email: string | null }
      | Array<{ full_name: string | null; email: string | null }>
      | null;
    const conductor = Array.isArray(raw) ? raw[0] : raw;
    return {
      id: row.id as string,
      person_id: row.person_id as string,
      stage: (row.stage as number | null) ?? null,
      meeting_date: (row.meeting_date as string | null) ?? null,
      meeting_time: (row.meeting_time as string | null) ?? null,
      duration_minutes: (row.duration_minutes as number | null) ?? null,
      location: (row.location as string | null) ?? null,
      response: (row.response as "accepted" | "declined" | null) ?? null,
      response_reason: (row.response_reason as string | null) ?? null,
      conductor_id: (row.conducted_by as string | null) ?? null,
      conductor_name: conductor?.full_name || conductor?.email || null,
    };
  });
}

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
