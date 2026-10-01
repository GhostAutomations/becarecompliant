"use server";

/**
 * Mark a "Getting set up" step Not needed, or needed after all (0366). The company id comes from
 * the post: set_setup_step refuses anyone but that company's Admin or the founder, so the
 * database decides, not this file.
 */

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setSetupStepNotNeeded(
  companyId: string,
  stepKey: string,
  notNeeded: boolean,
): Promise<{ ok?: true; error?: string }> {
  await requireUser();
  if (!UUID.test(companyId)) return { error: "That company could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_setup_step", {
    p_company: companyId,
    p_step: stepKey,
    p_not_needed: notNeeded,
  });
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  revalidatePath(`/founder/companies/${companyId}`);
  return { ok: true };
}
