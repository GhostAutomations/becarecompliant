import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { requireCompany, type Profile } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { INVOICING_ROLES } from "./types";

/**
 * Page guard for the Invoicing department. Requires a company context, the Pro
 * 'invoicing' feature, and a Branch Manager-or-above role. Mirrors the Complaints
 * guard: RLS is the real enforcement, this gives a clean redirect first.
 */
export async function requireInvoicing(): Promise<{
  user: User;
  profile: Profile;
  companyId: string;
}> {
  const { user, profile } = await requireCompany();
  const companyId = profile.company_id;
  if (!companyId) redirect("/dashboard");
  if (!INVOICING_ROLES.includes(profile.role)) redirect("/dashboard");
  if (!(await featureEnabled(companyId, "invoicing"))) redirect("/dashboard");
  return { user, profile, companyId };
}
