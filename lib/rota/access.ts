import "server-only";
import { notFound } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { getCompanyRow } from "@/lib/companies/row";
import { moduleOnInRow } from "@/lib/modules/switch";
import { isRotaOfficeRole } from "@/lib/rota/roles";

/**
 * Be Care Compliant: the guard every Rota and Visits route, server action and API calls first
 * (Stage 0, 2026-10-15).
 *
 * The module is off for every company unless the Founder has switched it on (0487). When it is
 * off, or the caller is not an office role, the route answers Not Found: the company sees no
 * sign the module exists. The switch is read from the company row the request has already
 * loaded (React cache), so the check costs no extra query.
 */
export async function requireRotaOffice() {
  const { user, profile } = await requireCompany();
  const companyId = profile.company_id;
  if (!companyId) notFound();
  const row = await getCompanyRow(companyId);
  if (!moduleOnInRow(row, "rota_visits")) notFound();
  if (!isRotaOfficeRole(profile.role)) notFound();
  return { user, profile, companyId, companyName: row?.name ?? "" };
}

/** For server actions: true only when the module is on for this company. Never redirects. */
export async function rotaModuleOn(companyId: string | null | undefined): Promise<boolean> {
  if (!companyId) return false;
  return moduleOnInRow(await getCompanyRow(companyId), "rota_visits");
}
