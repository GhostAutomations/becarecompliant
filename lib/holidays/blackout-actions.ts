"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/forms";

/**
 * People > Holidays > Blackout dates (0477, Phil 2026-10-15). Add, change and remove a blackout.
 * Company Admin, Responsible Individual, Registered Manager and the Founder: the database
 * functions (save_holiday_blackout, delete_holiday_blackout) check the role themselves and write
 * the audit log, so this is the courtesy and they are the control.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

export async function saveBlackout(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const id = String(formData.get("blackout_id") ?? "");
  const start = String(formData.get("start_date") ?? "");
  const end = String(formData.get("end_date") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const allBranches = formData.get("all_branches") === "1";
  const branchIds = formData.getAll("branch_ids").map(String).filter((x) => UUID.test(x));
  if (!ISO.test(start) || !ISO.test(end)) return { error: "Choose the first and last day." };
  if (end < start) return { error: "The last day cannot be before the first day." };
  if (reason.length < 2) return { error: "Give the reason staff will see, for example Christmas cover." };
  if (!allBranches && branchIds.length === 0) return { error: "Choose at least one branch, or All branches." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_holiday_blackout", {
    p_company: profile.company_id,
    p_id: UUID.test(id) ? id : null,
    p_start: start,
    p_end: end,
    p_reason: reason,
    p_all_branches: allBranches,
    p_branch_ids: allBranches ? [] : branchIds,
  });
  if (error) return { error: error.message };
  revalidatePath("/people/holiday");
  revalidatePath("/my");
  return { ok: "Saved" };
}

export async function deleteBlackout(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireCompany();
  const id = String(formData.get("blackout_id") ?? "");
  if (!UUID.test(id)) return { error: "That blackout was not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_holiday_blackout", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/people/holiday");
  revalidatePath("/my");
  return { ok: "Removed" };
}
