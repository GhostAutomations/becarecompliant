"use server";

import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/forms";
import { rotaModuleOn } from "@/lib/rota/access";

/**
 * Clear down a visit alert (Rota and Visits Stage 7, decision 10). The database checks the caller is
 * a Supervisor or above in the alert's branch, that the reason fits the alert, that Other has words,
 * and writes the audit line. Replies with the result; the Alerts tab refreshes itself.
 */
export async function clearAlertAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id || !(await rotaModuleOn(profile.company_id))) return { error: "Alerts are not available." };
  const id = String(fd.get("alert_id") ?? "");
  const reason = String(fd.get("reason") ?? "");
  const text = String(fd.get("text") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "That alert could not be found." };
  if (!reason) return { error: "Pick a reason from the list." };
  if (reason === "other" && !text) return { error: "Type the reason." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_alert_clear", { p_alert: id, p_reason: reason, p_text: reason === "other" ? text : null });
  if (error) return { error: error.message };
  return { ok: "Cleared." };
}
