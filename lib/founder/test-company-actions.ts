"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";

/**
 * Founder: mark a company as a test company, or not (0353, Phil 2026-09-30). A test company's
 * invoices are left off Founder > Invoices and it is left out of the revenue and MRR totals, so
 * billing tests on companies like Bevan never look like real money. Since 2 Oct 2026 a test
 * company also sends no emails or texts (lib/email/muted.ts), except password resets and invites. Guarded in the database by
 * companies_guard_founder_columns, so a Company Admin cannot set it on their own company.
 */
export async function setTestCompany(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requirePlatformAdmin();
  const companyId = String(formData.get("company_id") ?? "");
  const on = formData.get("on") === "yes";
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) return { error: "That company could not be found." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({ is_test: on })
    .eq("id", companyId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "That company could not be found." };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: "platform_admin",
    action: on ? "company.marked_test" : "company.unmarked_test",
    entityType: "company",
    entityId: companyId,
    summary: on
      ? "Marked as a test company: left off Invoices, revenue and MRR, and no emails or texts sent"
      : "No longer a test company: counted in Invoices, revenue and MRR again, and emails and texts sent again",
  });
  revalidatePath(`/founder/companies/${companyId}`);
  revalidatePath("/founder/invoices");
  revalidatePath("/founder/revenue");
  revalidatePath("/founder");
  return { ok: "Saved" };
}
