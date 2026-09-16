"use server";

/**
 * Be Care Compliant — save the register name order for the signed in user.
 *
 * Its own action rather than a branch of an existing one: every register calls it, and it
 * writes nothing but the caller's own preference. The RPC (migration 0280) only ever updates
 * auth.uid()'s row.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { asSortMode, type SortMode } from "@/lib/register/name-sort-pref";

export async function setRegisterNameSort(mode: SortMode): Promise<void> {
  await requireCompany();
  // Checked here as well as in the RPC: the RPC raises, and a raise from choosing a sort
  // order would put an error on screen for something with no visible consequence.
  const v = asSortMode(mode);
  const supabase = await createClient();
  await supabase.rpc("set_register_name_sort", { v });
  revalidatePath("/people");
  revalidatePath("/people/training");
  revalidatePath("/service-users");
}
