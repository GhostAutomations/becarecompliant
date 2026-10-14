"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/forms";
import { londonTodayIso } from "@/lib/holidays/changes";
import { parseGoodwillForm } from "@/lib/billing/goodwill-schedule";

/**
 * FOUNDER > GOODWILL CREDITS (0472, Phil 2026-10-14; docs/decisions/goodwill-credits.md).
 *
 * Both go through the database's own Founder only functions (create_goodwill_grant,
 * stop_goodwill_grant), which check is_platform_admin() and write the audit rows themselves, so
 * nothing is logged twice and nothing can be given unlogged.
 */

export async function createGoodwillGrant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const fields: Record<string, string> = {};
  for (const [k, v] of formData.entries()) fields[k] = String(v);
  const parsed = parseGoodwillForm(fields, londonTodayIso());
  if (!parsed.ok) return { error: parsed.error };
  const g = parsed.value;

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_goodwill_grant", {
    p_company_id: g.companyId,
    p_sms: g.sms,
    p_ai: g.ai,
    p_frequency: g.frequency,
    p_start: g.start,
    p_times: g.times,
    p_end: g.endDate,
    p_reason: g.reason,
    p_note: g.note,
  });
  if (error) return { error: error.message };
  revalidatePath("/founder/goodwill");
  revalidatePath("/founder");
  return { ok: g.start === londonTodayIso() ? "Done. The first credits are on their balance now." : "Done. The credits will be added on the start date." };
}

export async function stopGoodwillGrant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const id = String(formData.get("grant_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "That grant was not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("stop_goodwill_grant", { p_grant_id: id });
  if (error) return { error: error.message };
  revalidatePath("/founder/goodwill");
  revalidatePath("/founder");
  return { ok: "Stopped. Credits already given stay." };
}
