import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export type AuditInput = {
  companyId: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  /** Dotted verb, e.g. "company.created", "invite.resent", "user.role_changed". */
  action: string;
  /** e.g. "company", "branch", "invite", "profile". Never "item". */
  entityType: string;
  entityId?: string | null;
  summary?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Append one row to the append-only audit_log via the service-role client
 * (audit_log has no insert policy, so only the service role can write it).
 *
 * Best-effort by design: a failed audit write must never block a legitimate
 * action, so failures are logged to the server console rather than thrown. If
 * the service role is not configured the dependency is surfaced there too.
 */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("audit_log").insert({
      company_id: input.companyId,
      actor_id: input.actorId ?? null,
      actor_email: input.actorEmail ?? null,
      actor_role: input.actorRole ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      summary: input.summary ?? "",
      metadata: input.metadata ?? {},
    });
    if (error) {
      console.error("[audit] insert failed:", error.message, input.action);
    }
  } catch (e) {
    console.error("[audit] skipped:", (e as Error).message, input.action);
  }
}
