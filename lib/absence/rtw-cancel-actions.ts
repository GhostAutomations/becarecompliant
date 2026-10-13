"use server";

/**
 * Be Care Compliant — cancel or reinstate a Return to Work (0459, Phil 2026-10-13).
 *
 * Managers and above only: checked here for a clear message, and enforced by the database
 * (can_cancel_rtw inside cancel_rtw and reinstate_rtw, against the absence's own person and branch,
 * and a trigger that refuses any direct edit of the cancel columns). The database writes the audit
 * entries itself, so a cancel can never go unrecorded. A cancelled Return to Work is not deleted.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/forms";
import { canCancelReturnToWork, rtwCancelReasonProblem } from "@/lib/absence/rtw-roles";

const NOT_ALLOWED = "Only a Manager or above can cancel a Return to Work.";

function refresh() {
  revalidatePath("/people/absence");
  revalidatePath("/dashboard");
}

/** Cancel one or several outstanding Return to Works with one reason. All or nothing: if one is
 *  refused, none is cancelled, and the reason says which. */
export async function cancelReturnToWorks(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!canCancelReturnToWork(profile.role)) return { error: NOT_ALLOWED };

  const ids = [...new Set(formData.getAll("absence_id").map(String).filter(Boolean))];
  if (ids.length === 0) return { error: "Tick the Return to Works to cancel." };
  const reason = String(formData.get("reason") ?? "").trim();
  const problem = rtwCancelReasonProblem(reason);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_rtw", { p_ids: ids, p_reason: reason });
  if (error) return { error: error.message };
  refresh();

  const result = (data ?? {}) as { cancelled?: number; already?: number };
  const done = Number(result.cancelled ?? 0);
  const already = Number(result.already ?? 0);
  if (done === 0) return { ok: already === 1 ? "That Return to Work was already cancelled." : "Those Return to Works were already cancelled." };
  const word = done === 1 ? "Return to Work cancelled." : `${done} Return to Works cancelled.`;
  return { ok: already > 0 ? `${word} ${already} already cancelled.` : word };
}

/** Put a cancelled Return to Work back to outstanding. */
export async function reinstateReturnToWork(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!canCancelReturnToWork(profile.role)) return { error: "Only a Manager or above can reinstate a Return to Work." };
  const id = String(formData.get("absence_id") ?? "");
  if (!id) return { error: "Missing absence." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reinstate_rtw", { p_id: id });
  if (error) return { error: error.message };
  refresh();
  return { ok: data === "not_cancelled" ? "That Return to Work was not cancelled." : "Return to Work reinstated." };
}
