"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/forms";

/**
 * Remove, on the Recent activity tile (0473). Hides it for this person only, through
 * dismiss_user_notification, which touches nothing but their own row: never the completion, the
 * Evidence or anybody else's notification. Pressing it twice does nothing.
 */
export async function dismissNotification(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile();
  const id = String(formData.get("notification_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "That notification was not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("dismiss_user_notification", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { ok: "Removed" };
}
