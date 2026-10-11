import "server-only";

/**
 * Be Care Compliant — do the ids a form posted belong to this company? (security audit of
 * 10 October 2026, finding F12.)
 *
 * A server action is a public endpoint: whatever the screen offered, the browser can post any
 * branch, service user or person id. The complaint and incident actions used to write those ids
 * straight onto the row, so a manager could file a complaint under another company's branch and
 * it appeared in that company's register. Migration 0443 now refuses such a row in the database;
 * this checks first, so the person sees a plain message instead of a database error.
 *
 * Read with the service role on purpose: the question is only "is this id this company's",
 * never "may this person see it" (RLS on the write still decides that).
 */

import { createServiceClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CompanyLinks = {
  branchId?: string | null;
  serviceUserId?: string | null;
  personId?: string | null;
};

const CHECKS: Array<{ key: keyof CompanyLinks; table: string; refusal: string }> = [
  { key: "branchId", table: "branches", refusal: "That branch is not one of your company's branches." },
  { key: "serviceUserId", table: "service_users", refusal: "That service user is not one of your company's records." },
  { key: "personId", table: "people", refusal: "That team member is not one of your company's records." },
];

/** A message to show when any posted id is not this company's, otherwise null. */
export async function foreignLinkError(companyId: string, links: CompanyLinks): Promise<string | null> {
  const admin = createServiceClient();
  for (const check of CHECKS) {
    const id = links[check.key];
    if (!id) continue;
    if (!UUID.test(id)) return check.refusal;
    const { data, error } = await admin
      .from(check.table)
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) return `That could not be checked just now: ${error.message}`;
    if (!data) return check.refusal;
  }
  return null;
}
