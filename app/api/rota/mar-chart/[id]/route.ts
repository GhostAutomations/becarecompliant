import type { NextRequest } from "next/server";
import { requireRotaOffice } from "@/lib/rota/access";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { pdfResponse, exportError } from "@/lib/export/deliver";
import { renderReportPdf, type ReportDoc } from "@/lib/export/pdf";
import { getMar } from "@/lib/rota/mar-data";
import { buildMarChart, monthDays } from "@/lib/rota/mar-chart";

/**
 * The monthly MAR chart PDF (Rota and Visits Stage 6, Phil's popup 2026-10-17): ?month=YYYY-MM,
 * this month when left out. Read with the office person's own client, so RLS keeps them to their
 * own branches. Audit logged, as a MAR is special category health data.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { profile, companyId, companyName } = await requireRotaOffice();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return exportError("Service user not found.", 404);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const asked = req.nextUrl.searchParams.get("month") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : today.slice(0, 7);

  const supabase = await createClient();
  const { data: su } = await supabase
    .from("service_users")
    .select("id, full_name, ssid, date_of_birth, nhs_number, gp_practice, allergies, branch_id, branches(name)")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle<{
      id: string; full_name: string; ssid: string | null; date_of_birth: string | null; nhs_number: string | null; gp_practice: string | null;
      allergies: string | null; branch_id: string; branches: { name: string } | { name: string }[] | null;
    }>();
  if (!su) return exportError("Service user not found.", 404);

  const days = monthDays(month);
  const data = await getMar(id, days[0], days[days.length - 1]);
  const branch = Array.isArray(su.branches) ? su.branches[0] : su.branches;
  const doc = buildMarChart({
    companyName,
    branchName: branch?.name ?? "",
    serviceUserName: su.full_name,
    ssid: su.ssid,
    dateOfBirth: su.date_of_birth,
    nhsNumber: su.nhs_number,
    gpPractice: su.gp_practice,
    allergies: su.allergies,
    month,
    today,
    madeAt: new Date().toISOString(),
    meds: data.meds,
    visits: data.visits.map((v) => ({ id: v.id, date: v.date, slot: v.slot, clockedOut: v.clockedOut })),
    doses: data.doses,
  });

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "rota.mar_chart_downloaded",
    entityType: "service_user",
    entityId: id,
    summary: `Downloaded the MAR chart of ${su.full_name} for ${month}`,
    metadata: { month },
  });
  return pdfResponse(await renderReportPdf(doc as ReportDoc), `mar-chart-${month}`);
}
