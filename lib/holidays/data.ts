import "server-only";

/**
 * Be Care Compliant — Holiday (People extension) server data access.
 * RLS scopes what each user sees: a Team Member sees only their own requests,
 * a Manager their branch(es), an Admin all. Approved requests drive the branch
 * holiday calendar; pending requests drive the approvals strip.
 */

import { createClient } from "@/lib/supabase/server";

export type HolidayRequestRow = {
  id: string;
  company_id: string;
  branch_id: string | null;
  person_id: string | null;
  requested_by: string | null;
  requester_name: string | null;
  start_date: string;
  end_date: string;
  hours: number | null;
  note: string | null;
  status: "pending" | "approved" | "declined";
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

export async function listHolidayRequests(
  companyId: string,
  branchId?: string | null,
): Promise<HolidayRequestRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("holiday_requests")
    .select("*")
    .eq("company_id", companyId)
    .order("start_date", { ascending: true });
  if (branchId) query = query.eq("branch_id", branchId);
  const { data } = await query;
  return (data as HolidayRequestRow[] | null) ?? [];
}

export async function listPersonHolidays(
  personId: string,
): Promise<HolidayRequestRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("holiday_requests")
    .select("*")
    .eq("person_id", personId)
    .order("start_date", { ascending: false });
  return (data as HolidayRequestRow[] | null) ?? [];
}
