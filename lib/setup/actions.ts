"use server";

/**
 * Mark a "Getting set up" step Not needed, or needed after all (0366). The company id comes from
 * the post: set_setup_step refuses anyone but that company's Admin or the founder, so the
 * database decides, not this file.
 */

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin, requireUser } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
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

/**
 * The founder ticks a step off, or takes his own tick back (Phil, popup 2026-10-01: every step
 * except the agreement). founder_set_setup_step refuses anyone but a platform admin, refuses the
 * agreement, and Undo only ever removes a founder's tick, never a stamp the Admin earned.
 */
export async function founderSetSetupStepDone(
  companyId: string,
  stepKey: string,
  done: boolean,
): Promise<{ ok?: true; error?: string }> {
  const { user, profile } = await requirePlatformAdmin();
  if (!UUID.test(companyId)) return { error: "That company could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("founder_set_setup_step", {
    p_company: companyId,
    p_step: stepKey,
    p_done: done,
  });
  if (error) return { error: error.message };
  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: done ? "setup.step_ticked_by_founder" : "setup.step_unticked_by_founder",
    entityType: "company",
    entityId: companyId,
    summary: done ? `Set up step ticked off by Be Care Compliant: ${stepKey}` : `Set up step tick taken back: ${stepKey}`,
    metadata: { step: stepKey },
  });
  revalidatePath("/dashboard");
  revalidatePath(`/founder/companies/${companyId}`);
  return { ok: true };
}
