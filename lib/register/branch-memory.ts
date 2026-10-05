import "server-only";

/**
 * Be Care Compliant: the branch each register was last on, for this sign in (migration 0385).
 *
 * Phil, 2026-10-05: People compliance, Training and Service User compliance each remember the
 * branch they were last on, separately, and a new sign in starts on the primary branch again.
 * The RPC compares the stored session with the caller's verified JWT, so a memory from an
 * earlier sign in reads as nothing.
 */

import { createClient } from "@/lib/supabase/server";
import { REGISTER_SCREENS, type RegisterScreen } from "@/lib/register/branch-memory-screens";

/** Read as a plain value, never a throw: a register must render if this lookup fails. */
export async function getRememberedBranch(screen: RegisterScreen): Promise<string | null> {
  if (!REGISTER_SCREENS.includes(screen)) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_register_branch", { p_screen: screen });
    if (error) return null;
    return typeof data === "string" && data ? data : null;
  } catch {
    return null;
  }
}
