"use server";

/**
 * Be Care Compliant — save the register's custom column order + visibility (Item 4).
 * Company Admin (or Founder via manage-as) only. Persists register_position from the
 * given order and show_on_register per column, scoped to the caller's company and the
 * chosen population. RLS on check_definitions also enforces the admin write.
 */

import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/forms";

type ColumnInput = { id: string; show: boolean };

export async function saveRegisterColumns(input: {
  population: "people" | "service_users";
  columns: ColumnInput[];
}): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (profile.role !== "company_admin" && profile.role !== "platform_admin") {
    return { error: "Only an Admin can change the register columns." };
  }
  const population = input.population;
  if (population !== "people" && population !== "service_users") {
    return { error: "Unknown register." };
  }
  const columns = Array.isArray(input.columns) ? input.columns : [];

  const supabase = await createClient();
  // Persist each column's position (its index in the given order) and visibility,
  // scoped to this company + population so a crafted id from elsewhere is ignored.
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i];
    if (!c?.id) continue;
    const { error } = await supabase
      .from("check_definitions")
      .update({ register_position: i, show_on_register: Boolean(c.show) })
      .eq("id", c.id)
      .eq("company_id", profile.company_id)
      .eq("population", population);
    if (error) return { error: error.message };
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "company.register_columns_updated",
    entityType: "company",
    entityId: profile.company_id,
    summary: `Updated ${population === "people" ? "People" : "Service User"} register columns`,
    metadata: { population, count: columns.length },
  });

  revalidatePath(population === "people" ? "/people" : "/service-users");
  return { ok: "Saved." };
}
