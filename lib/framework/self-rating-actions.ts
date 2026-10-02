"use server";

/**
 * Setting the manager's own rating of a theme (0374, Phil 2026-10-02). RLS on
 * readiness_self_ratings is the guard (the people who record an inspection: Company Admin,
 * Registered Individual, Registered Manager, Manager); the checks here give a clear message.
 * A new rating is a new row, so every change is kept.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { ratingLabel, selfRatingProblem } from "@/lib/framework/ratings";
import { getRegisteredBranches } from "@/lib/framework/branches";

export async function setSelfRating(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const companyId = profile.company_id;
  if (!companyId) return { error: "No company context." };
  if (profile.actingAsCompanyId) return { error: "Support mode is for looking. The company sets its own rating." };
  const supabase = await createClient();

  const { data: co } = await supabase.from("companies").select("regulator").eq("id", companyId).maybeSingle();
  const regulator = ((co?.regulator as string | null) ?? "ciw") as "ciw" | "cqc";

  const code = String(fd.get("requirement_code") ?? "").trim();
  const rating = String(fd.get("rating") ?? "").trim();
  const note = String(fd.get("note") ?? "").trim().slice(0, 1000) || null;
  const branchRaw = String(fd.get("branch_id") ?? "").trim();

  const { data: req } = await supabase
    .from("framework_requirements")
    .select("code, title")
    .eq("regulator", regulator)
    .eq("code", code)
    .eq("active", true)
    .maybeSingle();
  if (!req) return { error: "That theme could not be found." };

  // A rating belongs to a registered service the person can see, or to the whole company when
  // it has none (the same choice the Readiness page makes).
  const branches = await getRegisteredBranches(companyId);
  let branchId: string | null = null;
  let branchName: string | null = null;
  if (branches.length > 0) {
    const b = branches.find((x) => x.id === branchRaw);
    if (!b) return { error: "Choose the branch you are rating." };
    branchId = b.id;
    branchName = b.name;
  }

  let nq = supabase
    .from("inspection_notices")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("regulator", regulator)
    .eq("requirement_code", code)
    .eq("kind", "priority_action")
    .is("resolved_on", null);
  if (branchId) nq = nq.or(`branch_id.eq.${branchId},branch_id.is.null`);
  const { count: priorityOpen } = await nq;
  const problem = selfRatingProblem(regulator, rating, priorityOpen ?? 0);
  if (problem) return { error: problem };

  const { data, error } = await supabase
    .from("readiness_self_ratings")
    .insert({
      company_id: companyId,
      branch_id: branchId,
      regulator,
      requirement_code: code,
      rating,
      note,
      set_by: user.id,
      set_by_name: profile.full_name || profile.email || "Unknown",
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Your rating could not be saved. You may not have permission to rate this theme." };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "readiness_self_rating.set",
    entityType: "readiness_self_rating",
    entityId: data.id as string,
    summary: `Rated ${req.title as string}${branchName ? ` for ${branchName}` : ""} as ${ratingLabel(regulator, rating)}`,
  });

  revalidatePath("/readiness");
  return { ok: "Rating saved." };
}
