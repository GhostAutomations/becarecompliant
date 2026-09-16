import "server-only";

/**
 * Be Care Compliant — the register name order, remembered per user.
 *
 * Phil, 2026-09-16: "default is A-Z First Name, when it is change it stays like that until
 * they change it, even when they log out." Stored on profiles (migration 0280) rather than in
 * the browser, because "even when they log out" has to survive a different machine.
 *
 * ONE setting for all three registers — People, Service Users and Training — because the
 * whole point of the shared header is that the three behave the same.
 */

import { createClient } from "@/lib/supabase/server";

export type SortMode = "first_az" | "first_za" | "surname_az" | "surname_za";

export const DEFAULT_SORT_MODE: SortMode = "first_az";

const MODES = new Set<string>(["first_az", "first_za", "surname_az", "surname_za"]);

/** Read as a plain value, never a throw: a register must render if this lookup fails. */
export function asSortMode(v: unknown): SortMode {
  return typeof v === "string" && MODES.has(v) ? (v as SortMode) : DEFAULT_SORT_MODE;
}

export async function getRegisterNameSort(userId: string): Promise<SortMode> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("register_name_sort")
    .eq("id", userId)
    .maybeSingle();
  return asSortMode(data?.register_name_sort);
}
