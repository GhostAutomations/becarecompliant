import "server-only";

/**
 * Be Care Compliant — audit trail reads (Phase 8).
 *
 * Three read paths, all DB enforced:
 *   getRecordAuditTrail  one record's history, via the record_audit_trail RPC
 *                        (guarded by can_manage_person / can_manage_service_user),
 *                        so branch Managers see a record's timeline in its drill
 *                        down. Oldest first (chat/timeline ordering rule).
 *   listCompanyAudit     the Company Admin viewer: plain SELECT, scoped to the
 *                        admin's own company by the audit_log_select policy.
 *   listFounderAudit     the Founder cross company console: plain SELECT, the
 *                        policy lets the Platform Admin read every company.
 *
 * The service role is never used here: reads run as the caller so RLS is the
 * only gate. Newest first for the viewers (they page backwards through history).
 */

import { createClient } from "@/lib/supabase/server";

export type AuditEntry = {
  id: string | null;
  company_id: string | null;
  created_at: string;
  action: string;
  actor_email: string | null;
  actor_role: string | null;
  summary: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
};

export type AuditFilters = {
  /** Case insensitive match on actor_email. */
  actor?: string | null;
  entityType?: string | null;
  /** ISO date (YYYY-MM-DD), inclusive. */
  from?: string | null;
  to?: string | null;
  /** Founder console only: restrict to one company. */
  companyId?: string | null;
  limit?: number;
};

const DEFAULT_LIMIT = 250;

/** One record's audit trail, oldest first, for the drill down history tab. */
export async function getRecordAuditTrail(
  recordType: "person" | "service_user",
  recordId: string,
): Promise<AuditEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_audit_trail", {
    p_record_type: recordType,
    p_record_id: recordId,
  });
  if (error || !data) return [];
  return (data as Omit<AuditEntry, "id" | "company_id">[]).map((r) => ({
    id: null,
    company_id: null,
    ...r,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  }));
}

async function runViewer(filters: AuditFilters): Promise<AuditEntry[]> {
  const supabase = await createClient();
  let query = supabase
    .from("audit_log")
    .select("id, company_id, created_at, action, actor_email, actor_role, summary, entity_type, entity_id, metadata")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? DEFAULT_LIMIT);

  if (filters.companyId) query = query.eq("company_id", filters.companyId);
  if (filters.actor) query = query.ilike("actor_email", `%${filters.actor}%`);
  if (filters.entityType) query = query.eq("entity_type", filters.entityType);
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00Z`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59Z`);

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as AuditEntry[]).map((r) => ({ ...r, metadata: r.metadata ?? {} }));
}

/** Company Admin viewer: RLS scopes to the admin's own company. */
export async function listCompanyAudit(filters: AuditFilters): Promise<AuditEntry[]> {
  return runViewer(filters);
}

/** Founder console: RLS lets the Platform Admin read every company. */
export async function listFounderAudit(filters: AuditFilters): Promise<AuditEntry[]> {
  return runViewer(filters);
}

/** The entity types worth filtering on, for the viewer dropdown. */
export const AUDIT_ENTITY_TYPES = [
  "company",
  "branch",
  "profile",
  "invite",
  "person",
  "service_user",
  "check_definition",
  "check_instance",
  "evidence",
  "form",
  "form_template",
  "holiday",
  "absence",
] as const;
