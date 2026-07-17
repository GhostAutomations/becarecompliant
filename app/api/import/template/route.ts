import type { NextRequest } from "next/server";
import { requireCompany } from "@/lib/auth/guards";
import { buildImportTemplate } from "@/lib/import/template";

// Founder-led onboarding: the bulk import is Company Admin (self-serve) or Founder
// operating inside the tenant via manage-as (platform_admin acting as the company).
const ALLOWED = ["company_admin", "platform_admin"];

export async function GET(req: NextRequest) {
  const { profile } = await requireCompany();
  if (!profile.company_id) return new Response("No company context.", { status: 400 });
  if (!ALLOWED.includes(profile.role)) return new Response("Not permitted.", { status: 403 });

  const population =
    req.nextUrl.searchParams.get("population") === "service_users" ? "service_users" : "people";
  const { csv, filename } = await buildImportTemplate(profile.company_id, population);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
