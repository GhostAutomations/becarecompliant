import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * notification_log helpers: the idempotency spine of Phase 6.
 *
 * Every send claims its dedupe_key FIRST (insert with status 'sending'). The
 * unique index on dedupe_key means a cron retry or double-fire loses the race
 * with error 23505 and skips: the same reminder can never send twice. After the
 * send attempt the row is updated to sent/failed so the log doubles as a
 * delivery audit readable by Company Admins and the Founder.
 *
 * Writes use the service-role client (notification_log has no insert policy),
 * mirroring lib/audit.ts.
 */

export type NotificationChannel = "email" | "sms";

export type NotificationClaim = {
  companyId: string;
  branchId?: string | null;
  recipientProfileId?: string | null;
  channel: NotificationChannel;
  /** e.g. "daily_digest", "chaser_7", "chaser_14", "sms_overdue",
   *  "holiday_request", "holiday_decision", "su_review_invite",
   *  "absence_meeting_invite" */
  kind: string;
  /** Globally unique, embeds recipient + period/entity. See migration 0043. */
  dedupeKey: string;
  toAddress: string;
  subject?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Claim a dedupe key. Returns the log row id when this run owns the send, or
 * null when it was already claimed (already sent or another run is sending).
 * Throws only if the service role is missing, so callers surface that
 * dependency instead of silently skipping.
 */
export async function claimNotification(
  claim: NotificationClaim,
): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("notification_log")
    .insert({
      company_id: claim.companyId,
      branch_id: claim.branchId ?? null,
      recipient_profile_id: claim.recipientProfileId ?? null,
      channel: claim.channel,
      kind: claim.kind,
      dedupe_key: claim.dedupeKey,
      to_address: claim.toAddress,
      subject: claim.subject ?? "",
      status: "sending",
      metadata: claim.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return null; // already claimed: skip, by design
    console.error("[notify] claim failed:", error.message, claim.dedupeKey);
    return null;
  }
  return data.id as string;
}

/** Record the outcome of a claimed send. Best-effort, like writeAudit. */
export async function settleNotification(
  logId: string,
  status: "sent" | "failed" | "skipped",
  error?: string,
): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error: dbError } = await supabase
      .from("notification_log")
      .update({
        status,
        error: error ?? null,
        sent_at: status === "sent" ? new Date().toISOString() : null,
      })
      .eq("id", logId);
    if (dbError) console.error("[notify] settle failed:", dbError.message, logId);
  } catch (e) {
    console.error("[notify] settle skipped:", (e as Error).message, logId);
  }
}
