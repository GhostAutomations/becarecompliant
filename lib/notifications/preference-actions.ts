"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/forms";

/**
 * Settings, Notifications, "Who is told when a check is completed" (0473, Phil 2026-10-14): the
 * grid, check types down the side, people across the top. Company Admin and Founder only: the
 * guard here is the courtesy, and the database functions (set_notification_preferences,
 * add_notification_branch) refuse anyone else themselves.
 */

const UUID = /^[0-9a-f-]{36}$/i;

/** Saves the people whose ticks changed (the grid sends their ids as "changed"). */
export async function saveNotificationGrid(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireCompanyAdmin();
  const changed = [...new Set(formData.getAll("changed").map(String))].filter((x) => UUID.test(x));
  if (changed.length === 0) return { ok: "Nothing changed" };
  const definitions = formData.getAll("definition_id").map(String).filter((x) => UUID.test(x));
  const inApp = new Set(formData.getAll("in_app").map(String));
  const email = new Set(formData.getAll("email").map(String));
  const supabase = await createClient();
  const failed: string[] = [];
  for (const pid of changed) {
    const prefs = definitions.map((d) => {
      const key = `${pid}:${d}`;
      return { definition_id: d, in_app: inApp.has(key) || email.has(key), email: email.has(key) };
    });
    const { error } = await supabase.rpc("set_notification_preferences", { p_profile: pid, p_prefs: prefs });
    if (error) failed.push(error.message);
  }
  revalidatePath("/settings/notifications");
  if (failed.length > 0) return { error: `Not everyone was saved: ${failed[0]}` };
  return { ok: "Saved" };
}

export async function addNotificationBranch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireCompanyAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  if (!UUID.test(userId)) return { error: "User not found." };
  if (!UUID.test(branchId)) return { error: "Choose a branch to add." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_notification_branch", { p_profile: userId, p_branch: branchId });
  if (error) return { error: error.message };
  revalidatePath("/settings/notifications");
  revalidatePath("/settings/users");
  return { ok: "Added" };
}
