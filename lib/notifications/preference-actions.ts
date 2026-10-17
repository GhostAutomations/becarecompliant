"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/forms";
import { CONCERN_GRID_ID, DOSE_GRID_ID } from "@/lib/rota/notes";
import { ALERT_GRID_ROWS } from "@/lib/rota/alerts";

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
      // Two separate ticks since 0474 (Phil, popup "Let Email stand alone").
      return { definition_id: d, in_app: inApp.has(key), email: email.has(key) };
    });
    const { error } = await supabase.rpc("set_notification_preferences", { p_profile: pid, p_prefs: prefs });
    if (error) failed.push(error.message);
  }
  /* "Concern raised in a care note" (Rota and Visits Stage 5): its own row and its own database
     function, sent only for the people the row applies to (the grid lists them). */
  if (formData.getAll("definition_id").map(String).includes(CONCERN_GRID_ID)) {
    const allowed = new Set(formData.getAll(`allowed:${CONCERN_GRID_ID}`).map(String));
    for (const pid of changed.filter((p) => allowed.has(p))) {
      const key = `${pid}:${CONCERN_GRID_ID}`;
      const { error } = await supabase.rpc("rota_set_concern_notification", { p_profile: pid, p_in_app: inApp.has(key), p_email: email.has(key) });
      if (error) failed.push(error.message);
    }
  }
  // "Dose refused or not available" (Stage 6): its own row, the generic module alert function.
  if (formData.getAll("definition_id").map(String).includes(DOSE_GRID_ID)) {
    const allowed = new Set(formData.getAll(`allowed:${DOSE_GRID_ID}`).map(String));
    for (const pid of changed.filter((p) => allowed.has(p))) {
      const key = `${pid}:${DOSE_GRID_ID}`;
      const { error } = await supabase.rpc("rota_set_alert_notification", { p_profile: pid, p_event: "dose_issue", p_in_app: inApp.has(key), p_email: email.has(key) });
      if (error) failed.push(error.message);
    }
  }
  // Visit late, Visit missed and Dose not recorded (Stage 7): the same generic function.
  for (const row of ALERT_GRID_ROWS) {
    if (!formData.getAll("definition_id").map(String).includes(row.id)) continue;
    const allowed = new Set(formData.getAll(`allowed:${row.id}`).map(String));
    for (const pid of changed.filter((p) => allowed.has(p))) {
      const key = `${pid}:${row.id}`;
      const { error } = await supabase.rpc("rota_set_alert_notification", { p_profile: pid, p_event: row.event, p_in_app: inApp.has(key), p_email: email.has(key) });
      if (error) failed.push(error.message);
    }
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

/** Who gets the morning emails (0475): saves the people whose ticks changed. */
export async function saveMorningEmailGrid(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireCompanyAdmin();
  const changed = [...new Set(formData.getAll("changed").map(String))].filter((x) => UUID.test(x));
  if (changed.length === 0) return { ok: "Nothing changed" };
  // Every part on the grid ("key~part"), and the ticked ones ("person~key~part"). The database
  // checks each part belongs to this company.
  const allParts = [...new Set(formData.getAll("part").map(String))];
  const receive = new Set(formData.getAll("receive").map(String));
  const supabase = await createClient();
  const failed: string[] = [];
  for (const pid of changed) {
    const prefs = allParts.map((kp) => {
      const [key, ...rest] = kp.split("~");
      return { key, part: rest.join("~"), receive: receive.has(`${pid}~${kp}`) };
    });
    const { error } = await supabase.rpc("set_morning_email_preferences", { p_profile: pid, p_prefs: prefs });
    if (error) failed.push(error.message);
  }
  revalidatePath("/settings/notifications");
  if (failed.length > 0) return { error: `Not everyone was saved: ${failed[0]}` };
  return { ok: "Saved" };
}

