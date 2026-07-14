import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { readActingCompanyId } from "@/lib/founder/manage-as";

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
    // If a manage-as cookie is live on this request, the writer is the founder
    // impersonating a tenant. Only a platform admin can hold a valid signed
    // cookie, so tag the row as impersonation and record the true role, without
    // touching any of the individual actions. No cookie (normal user, webhook,
    // cron) leaves the row exactly as passed in.
    let actorRole = input.actorRole ?? null;
    let metadata = input.metadata ?? {};
    try {
      const acting = await readActingCompanyId();
      if (acting) {
        actorRole = "platform_admin";
        metadata = { ...metadata, impersonating: true, acting_company_id: acting };
      }
    } catch {
      // cookies() unavailable in this context: leave the row untagged.
    }

    const supabase = createServiceClient();
    const { error } = await supabase.from("audit_log").insert({
      company_id: input.companyId,
      actor_id: input.actorId ?? null,
      actor_email: input.actorEmail ?? null,
      actor_role: actorRole,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      summary: input.summary ?? "",
      metadata,
    });
    if (error) {
      console.error("[audit] insert failed:", error.message, input.action);
    }
  } catch (e) {
    console.error("[audit] skipped:", (e as Error).message, input.action);
  }
}
