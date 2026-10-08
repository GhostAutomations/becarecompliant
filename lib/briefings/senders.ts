import "server-only";

/**
 * Be Care Compliant — who a memo or message can be sent FROM (0436, Phil 2026-10-08): the
 * company's office team, each with the title they sign with (their job title on their People
 * record, else their role). Read with the service role, pinned to the one company the caller
 * has already been checked against.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { ROLE_LABELS } from "@/lib/nav";

export type MemoSender = { id: string; name: string; title: string };

const OFFICE = ["company_admin", "registered_individual", "registered_manager", "manager", "supervisor"];

export async function listMemoSenders(companyId: string): Promise<MemoSender[]> {
  const admin = createServiceClient();
  const [{ data: profiles }, { data: people }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, role")
      .eq("company_id", companyId)
      .eq("status", "active")
      .in("role", OFFICE),
    admin.from("people").select("profile_id, job_title").eq("company_id", companyId).not("profile_id", "is", null),
  ]);
  const titles = new Map(
    ((people ?? []) as Array<{ profile_id: string; job_title: string | null }>).map((p) => [p.profile_id, (p.job_title ?? "").trim()]),
  );
  return ((profiles ?? []) as Array<{ id: string; full_name: string | null; role: string }>)
    .filter((p) => (p.full_name ?? "").trim())
    .map((p) => ({
      id: p.id,
      name: (p.full_name as string).trim(),
      title: titles.get(p.id) || ROLE_LABELS[p.role] || "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
