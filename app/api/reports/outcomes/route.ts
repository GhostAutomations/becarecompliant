import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { buildCsv } from "@/lib/export/csv";
import { getOutcomesRegister } from "@/lib/service-users/data";

const ALLOWED = ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"];

/** CSV of the personal outcomes register + PQS %. Manager+ via RLS. */
export async function GET(_req: NextRequest) {
  const { profile } = await requireCompany();
  if (!profile.company_id) return new Response("No company", { status: 403 });
  if (!ALLOWED.includes(profile.role)) return new Response("Forbidden", { status: 403 });

  const reg = await getOutcomesRegister(profile.company_id);
  const rows = reg.rows.map((r) => [
    r.full_name,
    r.branch_name ?? "",
    String(r.total),
    String(r.achievingOrProgressing),
    r.pct === null ? "" : `${r.pct}%`,
  ]);
  rows.push(["", "", "", "", ""]);
  rows.push([
    "OVERALL (PQS)",
    "",
    String(reg.totalInScope),
    String(reg.totalAchievingOrProgressing),
    reg.pqsPct === null ? "" : `${reg.pqsPct}%`,
  ]);

  const csv = buildCsv(
    ["Service user", "Branch", "Outcomes in scope", "Achieving or progressing", "Percent"],
    rows,
  );

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="outcomes.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
