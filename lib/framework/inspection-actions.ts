"use server";

/**
 * Recording a branch's inspection and the regulator's rating per theme (0363, Phil 2026-10-01).
 * RLS (branch_inspections_*) is the guard: Admins, company wide roles and managers, and only for a
 * branch of their own company. The checks here are for a clear message.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { parseRatings } from "@/lib/framework/ratings";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function recordBranchInspection(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const companyId = profile.company_id;
  if (!companyId) return { error: "No company context." };
  const supabase = await createClient();

  const { data: co } = await supabase.from("companies").select("regulator").eq("id", companyId).maybeSingle();
  const regulator = ((co?.regulator as string | null) ?? "ciw") as "ciw" | "cqc";

  const branchId = String(fd.get("branch_id") ?? "").trim();
  const inspectedOn = String(fd.get("inspected_on") ?? "").trim();
  const publishedOn = String(fd.get("published_on") ?? "").trim() || null;
  const notes = String(fd.get("notes") ?? "").trim().slice(0, 2000) || null;

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name")
    .eq("id", branchId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!branch) return { error: "Choose the branch that was inspected." };
  if (!ISO.test(inspectedOn)) return { error: "Enter the date the inspection was completed." };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  if (inspectedOn > today) return { error: "The inspection date cannot be in the future." };
  if (publishedOn && !ISO.test(publishedOn)) return { error: "Enter a valid date the report was published." };
  if (publishedOn && publishedOn < inspectedOn) return { error: "The report cannot be published before the inspection." };

  const { data: reqs } = await supabase
    .from("framework_requirements")
    .select("code")
    .eq("regulator", regulator)
    .eq("active", true);
  const codes = ((reqs as Array<{ code: string }> | null) ?? []).map((r) => r.code);
  const parsed = parseRatings(regulator, codes, (k) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : null;
  });
  if (!parsed.ok) return { error: parsed.error };

  const { data, error } = await supabase
    .from("branch_inspections")
    .insert({
      company_id: companyId,
      branch_id: branchId,
      regulator,
      inspected_on: inspectedOn,
      published_on: publishedOn,
      ratings: parsed.ratings,
      notes,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "The inspection could not be saved. Please try again." };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "branch_inspection.recorded",
    entityType: "branch_inspection",
    entityId: data.id as string,
    summary: `Recorded the ${regulator.toUpperCase()} inspection of ${branch.name as string} on ${inspectedOn}`,
  });

  revalidatePath("/readiness");
  revalidatePath("/dashboard");
  return { ok: "Inspection recorded." };
}
