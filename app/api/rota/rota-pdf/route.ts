import type { NextRequest } from "next/server";
import { requireRotaOffice } from "@/lib/rota/access";
import { writeAudit } from "@/lib/audit";
import { pdfResponse, exportError } from "@/lib/export/deliver";
import { renderReportPdf, type ReportDoc } from "@/lib/export/pdf";
import { getRotaBranches } from "@/lib/rota/data";
import { getDayVisits } from "@/lib/rota/visits-data";
import { addDaysIso, mondayOfIso } from "@/lib/rota/working-time";
import { buildRotaPrint } from "@/lib/rota/rota-print";

/**
 * The weekly rota PDF for one branch (Rota and Visits Stage 6, decision 9): ?branch=&week=, the
 * paper fallback with each carer's visits by day. Only a branch the office person can see; read
 * with their own client, so RLS decides. Audit logged.
 */
export async function GET(req: NextRequest) {
  const { profile, companyId, companyName } = await requireRotaOffice();
  const sp = req.nextUrl.searchParams;
  const branches = await getRotaBranches(companyId, profile.role === "company_admin" && !!profile.actingAsCompanyId);
  const branch = branches.find((b) => b.id === sp.get("branch"));
  if (!branch) return exportError("Branch not found.", 404);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const week = sp.get("week") ?? "";
  const monday = mondayOfIso(/^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today);

  const days = await Promise.all(Array.from({ length: 7 }, (_, i) => getDayVisits(branch.id, addDaysIso(monday, i))));
  const doc = buildRotaPrint({
    companyName,
    branchName: branch.name,
    monday,
    madeAt: new Date().toISOString(),
    visits: days.flat().map((v) => ({
      date: v.visitDate,
      startTime: v.startTime,
      endTime: v.endTime,
      serviceUserName: v.serviceUserName,
      postcode: v.postcode,
      service: v.service,
      status: v.status,
      paused: v.paused,
      carersNeeded: v.carersNeeded,
      carers: v.assignments.map((a) => ({ personId: a.personId, name: a.name })),
      timeSensitive: Boolean(v.timeSensitive),
    })),
  });

  await writeAudit({
    companyId,
    actorId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "rota.week_printed",
    entityType: "branch",
    entityId: branch.id,
    summary: `Printed the rota for ${branch.name}, week of ${monday}`,
    metadata: { monday },
  });
  return pdfResponse(await renderReportPdf(doc as ReportDoc), `rota-${monday}`);
}
