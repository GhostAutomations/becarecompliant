import "server-only";

/**
 * Be Care Compliant — reading a company's department settings.
 *
 * The pure half is in module-catalogue.ts (the ceiling) and module-paths.ts (which URL is which
 * department). This is the small server side that fetches the rows and hands them to those.
 *
 * Deduped per request by React cache(), so a page that asks and a nav that asks cost one query.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { canUseModule, disabledKey } from "./module-catalogue";

/**
 * The `role|module` pairs this company has switched OFF.
 *
 * A FAILED READ RETURNS AN EMPTY SET, on purpose. The ceiling and RLS are what actually protect
 * anything; these rows only narrow beneath them. So a hiccup reading them shows somebody a
 * department their company had hidden, which is a tidiness problem, where the other way round
 * locks a whole company out of its own product because one query timed out.
 */
export const disabledModules = cache(async (companyId: string | null): Promise<Set<string>> => {
  if (!companyId) return new Set();
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_role_modules")
    .select("role, module_key")
    .eq("company_id", companyId);
  const out = new Set<string>();
  for (const row of ((data as Array<{ role: string; module_key: string }> | null) ?? [])) {
    out.add(disabledKey(row.role, row.module_key));
  }
  return out;
});

/** May this role open this department in this company? */
export async function canOpenModule(
  key: string,
  role: string,
  companyId: string | null,
): Promise<boolean> {
  return canUseModule(key, role, await disabledModules(companyId));
}
