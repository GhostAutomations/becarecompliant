import "server-only";

/**
 * Be Care Compliant — Regulation 73 (RI branch visit) prefill.
 * Pulls as much of the RI branch-visit report as we already hold, for one branch,
 * by REUSING the existing engines (no parallel logic): the PQS measures
 * (getPqsMeasures) for the training / supervision / care plan review / satisfaction /
 * outcomes / SCW rates, the compliance status view for overdue counts, the Complaints
 * module for service-user feedback, People for the staffing picture, and the previous
 * submitted visit for the "status of last visit's actions" carry-forward.
 * Everything reads through the caller's RLS client (branch authorised). No dashes in copy.
 */

import { createClient } from "@/lib/supabase/server";
import { getPqsMeasures, defaultOnTimeWindow } from "@/lib/export/on-time";
import { addMonths, todayInLondon, formatCivilDate } from "@/lib/recurrence";

export type Reg73Prefill = {
  branchId: string;
  branchName: string;
  generatedAt: string;
  spotCheckOverdue: number;
  supervisionOverdue: number;
  overdueByCheck: { checkName: string; count: number }[];
  pqs: {
    mandatoryTraining: number | null;
    safeguarding: number | null;
    scwRegistration: number | null;
    supervisionOnTime: number | null;
    carePlanReviewOnTime: number | null;
    customerSatisfaction: number | null;
    personalOutcomes: number | null;
  };
  complaints: {
    total: number;
    byType: { type: string; count: number }[];
    recent: { subject: string; type: string | null; status: string; date: string | null }[];
  };
  staffing: { total: number; roles: { title: string; count: number }[] };
  previousVisit: { endDate: string | null; data: Record<string, unknown> } | null;
};

const pct = (v: number | null | undefined): number | null => (v == null ? null : v);

export async function getReg73Prefill(input: {
  companyId: string;
  companyName: string;
  branchId: string;
  branchName: string;
}): Promise<Reg73Prefill> {
  const supabase = await createClient();
  const today = formatCivilDate(todayInLondon());
  const threeMonthsAgo = formatCivilDate(addMonths(todayInLondon(), -3));

  const [measures, statusRows, peopleRows, prevVisit, complaintsRes] = await Promise.all([
    getPqsMeasures({
      companyId: input.companyId,
      companyName: input.companyName,
      branchId: input.branchId,
      branchName: input.branchName,
      window: defaultOnTimeWindow(),
    }),
    supabase
      .from("person_check_status")
      .select("check_name, rag")
      .eq("company_id", input.companyId)
      .eq("branch_id", input.branchId),
    supabase
      .from("people")
      .select("job_title")
      .eq("company_id", input.companyId)
      .eq("branch_id", input.branchId)
      .is("archived_at", null)
      .neq("employment_status", "leaver"),
    supabase
      .from("reg73_visits")
      .select("end_date, data")
      .eq("company_id", input.companyId)
      .eq("branch_id", input.branchId)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("complaints")
      .select("subject, concern_type, status, date_raised, created_at")
      .eq("company_id", input.companyId)
      .eq("branch_id", input.branchId)
      .gte("created_at", threeMonthsAgo)
      .order("created_at", { ascending: false }),
  ]);

  // PQS rates, mapped by measure name.
  const byName = new Map(
    (measures as { name: string; rate: number | null }[]).map((m) => [m.name, m.rate]),
  );
  const pqs = {
    mandatoryTraining: pct(byName.get("Mandatory training")),
    safeguarding: pct(byName.get("Safeguarding training")),
    scwRegistration: pct(byName.get("Social Care Wales registration")),
    supervisionOnTime: pct(byName.get("Supervision")),
    carePlanReviewOnTime: pct(byName.get("Care Plan Review")),
    customerSatisfaction: pct(byName.get("Customer satisfaction")),
    personalOutcomes: pct(byName.get("Personal outcomes")),
  };

  // Overdue counts per check (rag red), the KPI dashboard figures.
  const overdueMap = new Map<string, number>();
  for (const r of (statusRows.data as { check_name: string; rag: string }[] | null) ?? []) {
    if (r.rag === "red") overdueMap.set(r.check_name, (overdueMap.get(r.check_name) ?? 0) + 1);
  }
  const overdueByCheck = Array.from(overdueMap.entries())
    .map(([checkName, count]) => ({ checkName, count }))
    .sort((a, b) => b.count - a.count);

  // Staffing structure: headcount by job title.
  const roleMap = new Map<string, number>();
  for (const p of (peopleRows.data as { job_title: string | null }[] | null) ?? []) {
    const t = (p.job_title ?? "").trim() || "Not set";
    roleMap.set(t, (roleMap.get(t) ?? 0) + 1);
  }
  const roles = Array.from(roleMap.entries())
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count);
  const staffTotal = (peopleRows.data as unknown[] | null)?.length ?? 0;

  // Complaints in the last 3 months for this branch.
  type Cx = { subject: string; concern_type: string | null; status: string; date_raised: string | null; created_at: string };
  const cx = (complaintsRes.data as Cx[] | null) ?? [];
  const typeMap = new Map<string, number>();
  for (const c of cx) {
    const t = (c.concern_type ?? "").trim() || "Not categorised";
    typeMap.set(t, (typeMap.get(t) ?? 0) + 1);
  }

  return {
    branchId: input.branchId,
    branchName: input.branchName,
    generatedAt: today,
    spotCheckOverdue: overdueMap.get("Spot Check") ?? 0,
    supervisionOverdue: overdueMap.get("Supervision") ?? 0,
    overdueByCheck,
    pqs,
    complaints: {
      total: cx.length,
      byType: Array.from(typeMap.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      recent: cx.slice(0, 8).map((c) => ({
        subject: c.subject,
        type: c.concern_type,
        status: c.status,
        date: c.date_raised ?? c.created_at.slice(0, 10),
      })),
    },
    staffing: { total: staffTotal, roles },
    previousVisit: prevVisit.data
      ? {
          endDate: (prevVisit.data as { end_date: string | null }).end_date ?? null,
          data: ((prevVisit.data as { data: Record<string, unknown> | null }).data ?? {}) as Record<string, unknown>,
        }
      : null,
  };
}
