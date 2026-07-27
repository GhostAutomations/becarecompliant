import "server-only";

/**
 * Be Care Compliant — the policies a new starter is given automatically.
 *
 * Phil, 2026-07-27: without this, the standing policy set only ever reaches the
 * people who happened to be on the register the day it was sent. Everyone hired
 * afterwards is quietly exempt, and nobody finds out until an inspector asks why
 * the newest carer has never signed the safeguarding policy.
 *
 * Runs on adding a Person and on importing one, best effort: a policy that fails
 * to attach must never cost the customer the record they were creating.
 */

import { createServiceClient } from "@/lib/supabase/admin";

export async function assignStandingPolicies(
  companyId: string,
  personId: string,
  assignedBy: string,
): Promise<number> {
  try {
    // Service role on purpose: this runs inside "add a person", which a Branch
    // Manager may do, and they cannot read the whole policy library themselves.
    const admin = createServiceClient();
    const { data: policies } = await admin
      .from("company_policies")
      .select("id, version")
      .eq("company_id", companyId)
      .eq("status", "active")
      .eq("assign_to_new_starters", true);
    if (!policies || policies.length === 0) return 0;

    // Never duplicate: re-adding somebody, or an import re-run, must not stack up
    // two copies of the same policy (the partial unique index would refuse the
    // whole insert, taking the good rows with it).
    const { data: held } = await admin
      .from("assignments")
      .select("policy_id")
      .eq("person_id", personId)
      .eq("status", "assigned");
    const alreadyHas = new Set(
      ((held ?? []) as Array<{ policy_id: string | null }>).map((r) => r.policy_id),
    );

    const rows = (policies as Array<{ id: string; version: number | null }>)
      .filter((p) => !alreadyHas.has(p.id))
      .map((p) => ({
        company_id: companyId,
        person_id: personId,
        kind: "policy" as const,
        policy_id: p.id,
        policy_version: p.version ?? 1,
        assigned_by: assignedBy,
      }));
    if (rows.length === 0) return 0;

    const { data: created, error } = await admin.from("assignments").insert(rows).select("id");
    if (error) {
      console.error("[new starter] policies not assigned:", error.message);
      return 0;
    }
    return created?.length ?? 0;
  } catch (e) {
    console.error("[new starter] policies not assigned:", (e as Error).message);
    return 0;
  }
}
