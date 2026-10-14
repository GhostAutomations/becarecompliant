"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { resendConfigured } from "@/lib/email/resend";
import type { ActionState } from "@/lib/forms";

/**
 * Settings, Users, a user, Notifications (0473, Phil 2026-10-14). Company Admin and Founder only:
 * the guard here is the courtesy, and the database functions (get_ / set_notification_preferences,
 * add_notification_branch) refuse anyone else themselves.
 */

export type NotificationPrefRow = {
  definitionId: string;
  population: "people" | "service_users";
  checkName: string;
  inApp: boolean;
  email: boolean;
};

export async function loadNotificationSettings(
  userId: string,
): Promise<{ ok: true; rows: NotificationPrefRow[]; emailConfigured: boolean } | { ok: false; error: string }> {
  await requireCompanyAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { ok: false, error: "User not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_notification_preferences", { p_profile: userId });
  if (error) return { ok: false, error: error.message };
  const rows = ((data ?? []) as Array<{ definition_id: string; population: string; check_name: string; in_app: boolean; email: boolean }>).map((r) => ({
    definitionId: r.definition_id,
    population: r.population === "people" ? ("people" as const) : ("service_users" as const),
    checkName: r.check_name,
    inApp: r.in_app,
    email: r.email,
  }));
  return { ok: true, rows, emailConfigured: resendConfigured() };
}

export async function saveNotificationSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireCompanyAdmin();
  const userId = String(formData.get("user_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { error: "User not found." };
  const ids = formData.getAll("definition_id").map(String);
  const inApp = new Set(formData.getAll("in_app").map(String));
  const email = new Set(formData.getAll("email").map(String));
  const prefs = ids.map((id) => ({ definition_id: id, in_app: inApp.has(id) || email.has(id), email: email.has(id) }));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_notification_preferences", { p_profile: userId, p_prefs: prefs });
  if (error) return { error: error.message };
  revalidatePath("/settings/users");
  return { ok: "Saved" };
}

export async function addNotificationBranch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireCompanyAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const branchId = String(formData.get("branch_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { error: "User not found." };
  if (!/^[0-9a-f-]{36}$/i.test(branchId)) return { error: "Choose a branch to add." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_notification_branch", { p_profile: userId, p_branch: branchId });
  if (error) return { error: error.message };
  revalidatePath("/settings/users");
  return { ok: "Added" };
}
