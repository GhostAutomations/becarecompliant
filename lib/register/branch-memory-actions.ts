"use server";

/**
 * Be Care Compliant: remember the branch a register is on, for this sign in (migration 0385).
 *
 * Writes nothing but the caller's own preference. Never throws to the screen: choosing a branch
 * has no visible consequence if the memory fails to save, beyond opening on the primary branch
 * next time.
 */

import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { REGISTER_SCREENS, type RegisterScreen } from "@/lib/register/branch-memory-screens";

export async function rememberRegisterBranch(screen: RegisterScreen, branch: string): Promise<void> {
  if (!REGISTER_SCREENS.includes(screen) || !branch) return;
  try {
    await requireCompany();
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_register_branch", { p_screen: screen, p_branch: branch });
    if (error) console.error("[register-branch] could not remember branch", error.message);
  } catch (e) {
    console.error("[register-branch] could not remember branch", e);
  }
}
