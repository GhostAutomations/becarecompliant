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
import { narrowedDisabled, type CustomRole } from "./custom-roles";

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

/**
 * The company's own roles (0314), with the departments each has switched off.
 *
 * Same bargain as disabledModules above: a failed read returns NO custom roles, which shows
 * somebody a department their company had hidden rather than locking them out of the product.
 * These rows narrow; they never protect.
 */
export const companyRoles = cache(async (companyId: string | null): Promise<CustomRole[]> => {
  if (!companyId) return [];
  const supabase = await createClient();
  const { data: roles } = await supabase
    .from("company_roles")
    .select("id, name, base_role")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  const list = (roles as Array<{ id: string; name: string; base_role: string }> | null) ?? [];
  if (list.length === 0) return [];
  const { data: offRows } = await supabase
    .from("company_role_modules_off")
    .select("company_role_id, module_key")
    .in("company_role_id", list.map((r) => r.id));
  const offByRole = new Map<string, string[]>();
  for (const row of ((offRows as Array<{ company_role_id: string; module_key: string }> | null) ?? [])) {
    offByRole.set(row.company_role_id, [...(offByRole.get(row.company_role_id) ?? []), row.module_key]);
  }
  return list.map((r) => ({
    id: r.id,
    name: r.name,
    baseRole: r.base_role,
    off: offByRole.get(r.id) ?? [],
  }));
});

/**
 * What ONE PERSON cannot open: their company's switches for their built-in role, plus whatever
 * their own custom role narrows further.
 *
 * This is the set for the person looking at the screen. The Settings screen wants
 * disabledModules() instead, because it shows every role side by side and must not fold one
 * person's narrowing into a tile about everybody.
 */
export async function disabledModulesFor(
  companyId: string | null,
  role: string,
  companyRoleId: string | null,
): Promise<Set<string>> {
  const company = await disabledModules(companyId);
  if (!companyRoleId) return new Set(company);
  const mine = (await companyRoles(companyId)).find((r) => r.id === companyRoleId) ?? null;
  return narrowedDisabled(company, role, mine);
}

/** May this person open this department? */
export async function canOpenModule(
  key: string,
  role: string,
  companyId: string | null,
  companyRoleId: string | null = null,
): Promise<boolean> {
  return canUseModule(key, role, await disabledModulesFor(companyId, role, companyRoleId));
}
