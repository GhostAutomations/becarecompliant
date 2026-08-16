import "server-only";

/**
 * WHO ARE MY COLLEAGUES, AND WHAT ARE THEY CALLED.
 *
 * The one place the app is allowed to ask. profiles_select gives anybody who is not a
 * company_admin exactly one row, their own, so every direct read of `profiles` and every
 * embedded `profiles(full_name)` join silently returned nothing for everyone else. That is not a
 * theoretical hazard: in one day it made the On Call rota say "Unassigned" on every shift, left
 * the Absence conductor dropdown empty so a Supervisor could not book a meeting at all, and made
 * the Line manager picker collapse to a single name, so saving any field on a colleague's record
 * quietly wiped their line manager.
 *
 * Both calls go through SECURITY DEFINER functions (migrations 0197 and 0198) that are confined
 * to one company and gated on membership. Use these; do not read the table.
 *
 * listStaff is for PICKERS and is gated to the roles that have one to fill: Admins, the
 * Registered roles, Managers, Supervisors and On Call. profilesById is for RESOLVING NAMES you
 * already hold ids for, and any active member of the company may do that.
 */

import { createClient } from "@/lib/supabase/server";
import { readActingCompanyId } from "@/lib/founder/manage-as";

/**
 * The company these lookups are ABOUT.
 *
 * Read from the manage-as cookie, the same source applyManageAs uses, so the founder operating
 * inside a tenant is answered about THAT tenant rather than about nothing. He has no company of
 * his own (platform_admin_has_no_company), and the database sees his real auth.uid() whatever the
 * shadowed profile says, so without this every name lookup came back empty for him and the
 * support path reproduced the exact faults this module exists to fix.
 *
 * A cookie read, not a query. Nothing clears that cookie on sign out or sign in, so on a shared
 * browser a colleague signing in within its 30 minute life inherits it. That is not a leak of
 * anything (the cookie only names a company), but until 0199 it was worse than a leak: the SQL
 * refused a company the caller is not a member of by returning NOTHING, so every name in the app
 * would have gone quietly blank. 0199 IGNORES a company id the caller has no claim to and
 * answers about their own instead, which is all they could ever read anyway.
 */
async function actingCompanyId(explicit?: string | null): Promise<string | null> {
  return explicit ?? (await readActingCompanyId());
}

export type CompanyProfile = { id: string; name: string; email: string | null; role: string };

/**
 * Names for ids you ALREADY HOLD. Includes people who have since left, because a booking made
 * last month, a meeting held in June and a complaint answered in March all still have to say who
 * did them.
 */
export async function profilesById(
  ids: Array<string | null | undefined>,
  companyId?: string | null,
): Promise<Map<string, CompanyProfile>> {
  const wanted = [...new Set(ids.filter(Boolean) as string[])];
  if (wanted.length === 0) return new Map();
  const supabase = await createClient();
  /*
   * companyId matters for the FOUNDER MANAGING AS A COMPANY. applyManageAs shadows the profile in
   * JavaScript; the database still sees his own auth.uid(), and a platform_admin has no company
   * of his own, so without it every one of these lookups came back empty and the support path
   * reproduced the very faults this module exists to fix. Callers that have the acting company to
   * hand should pass it; everyone else falls back to their own.
   */
  const cid = await actingCompanyId(companyId);
  // Chunked, not paged: PostgREST truncates at 1000 rows without erroring, and this function has
  // no ORDER BY, so a range over it would be reading an undefined order. Ask for fewer instead.
  const out = new Map<string, CompanyProfile>();
  for (let i = 0; i < wanted.length; i += 500) {
    const { data } = await supabase.rpc("company_profiles_by_id", { ids: wanted.slice(i, i + 500), cid });
    for (const p of (data ?? []) as CompanyProfile[]) out.set(p.id, p);
  }
  return out;
}

/** One name, for the common case. Null when it cannot be resolved, never a made up word. */
export async function profileName(id: string | null | undefined, companyId?: string | null): Promise<string | null> {
  if (!id) return null;
  return (await profilesById([id], companyId)).get(id)?.name ?? null;
}

/**
 * The colleagues a picker may offer. ACTIVE only, because you cannot give new work to somebody
 * who has left; pass the roles the screen wants.
 */
export async function listStaff(opts?: { companyId?: string | null; roles?: string[] }): Promise<CompanyProfile[]> {
  const supabase = await createClient();
  const cid = await actingCompanyId(opts?.companyId);
  /*
   * PAGED. PostgREST caps a response at 1000 rows and says nothing about it, and the On Call
   * rota asks for every active person in the company with no role filter. A large company's
   * picker would have stopped partway through the alphabet, with no error and nothing on screen
   * to say so.
   *
   * Advance by what CAME BACK, never by the page size: db-max-rows can be set below 1000, and
   * "short page means last page" would then break on page one and truncate at the cap, which is
   * the same bug at a different number. Ordering is `name, id` (0200), a total order, so no row
   * can straddle a boundary and be served twice or skipped.
   */
  const PAGE = 1000;
  const all: CompanyProfile[] = [];
  for (let from = 0; ; ) {
    const { data } = await supabase
      .rpc("list_company_staff", { cid, roles: opts?.roles ?? null })
      .range(from, from + PAGE - 1);
    const page = (data ?? []) as CompanyProfile[];
    if (page.length === 0) break;
    all.push(...page);
    from += page.length;
  }
  return all;
}
