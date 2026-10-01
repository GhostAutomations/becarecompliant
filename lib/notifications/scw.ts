import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { todayInLondon, formatCivilDate } from "@/lib/recurrence";
import { REPORTING_HORIZON_DAYS, type ReportingCheck } from "@/lib/notifications/data";
import { scwApplyBy } from "@/lib/people/scw";

/**
 * SOCIAL CARE WALES RENEWALS IN THE DAILY PEOPLE REPORT (0361, Phil 2026-10-01, popup).
 *
 * Rides in the People report like training (lib/notifications/training.ts), not a third email.
 *
 * DATED BY THE SEND BY DATE, not the renewal date. The renewal must reach Social Care Wales at
 * least 21 days before the registration expires (Registration Rules 2024, rule 16(4)), and this
 * email is headed "due in the next 14 days": listing the renewal date itself would first appear
 * when it was already too late to apply on time. So the line is the last day to send the renewal,
 * which reaches the report 35 days before expiry and goes overdue the moment it is late.
 *
 * Welsh companies only, active people with a number and a renewal date. Throws on a read error,
 * like training, because a partial reminder looks exactly like a complete one.
 */
export async function getScwAttention(companyId: string): Promise<ReportingCheck[]> {
  const supabase = createServiceClient();
  const { data: co } = await supabase.from("companies").select("regulator").eq("id", companyId).maybeSingle();
  if ((co?.regulator as string | null) === "cqc") return [];

  const today = formatCivilDate(todayInLondon());
  const [y, m, d] = today.split("-").map(Number);
  const horizon = new Date(Date.UTC(y, m - 1, d + REPORTING_HORIZON_DAYS)).toISOString().slice(0, 10);

  const { data: branches } = await supabase.from("branches").select("id, name").eq("company_id", companyId);
  const branchNames = new Map((branches ?? []).map((b) => [b.id as string, b.name as string]));

  const { data, error } = await supabase
    .from("people")
    .select("id, full_name, branch_id, scw_registration_number, scw_renewal_date")
    .eq("company_id", companyId)
    .is("archived_at", null)
    .neq("employment_status", "leaver")
    .not("scw_renewal_date", "is", null)
    .not("scw_registration_number", "is", null);
  if (error) throw new Error(`Social Care Wales renewal dates could not be read: ${error.message}`);

  const out: ReportingCheck[] = [];
  for (const p of (data as Array<{ id: string; full_name: string; branch_id: string | null; scw_registration_number: string | null; scw_renewal_date: string }> | null) ?? []) {
    if (!p.scw_registration_number || p.scw_registration_number.trim() === "") continue;
    const sendBy = scwApplyBy(p.scw_renewal_date);
    if (sendBy > horizon) continue;
    out.push({
      population: "people",
      recordId: p.id,
      recordName: p.full_name,
      branchId: p.branch_id,
      branchName: p.branch_id ? branchNames.get(p.branch_id) ?? "Unassigned" : "Unassigned",
      checkName: "Social Care Wales renewal: last day to send it",
      dueDate: sendBy,
    });
  }
  return out;
}
