import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Per-company usage metering (Diamond tier depends on this). One row per
 * metered event: an SMS send (units = message segments) or an AI call
 * (units = total tokens, with input/output split in metadata).
 *
 * Best-effort by design, like writeAudit: a failed meter write must never block
 * the SMS or AI call itself, so failures log to the server console. Writes are
 * service-role only (usage_events has no insert policy).
 */
export async function recordUsage(input: {
  companyId: string;
  kind: "sms" | "ai";
  /** SMS: segment count. AI: total tokens. */
  units: number;
  /** Estimated cost in pence, when known. */
  costPence?: number | null;
  /** External reference: Twilio message SID, Anthropic request id, etc. */
  ref?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("usage_events").insert({
      company_id: input.companyId,
      kind: input.kind,
      units: input.units,
      cost_pence: input.costPence ?? null,
      ref: input.ref ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) {
      console.error("[usage] insert failed:", error.message, input.kind);
    }
  } catch (e) {
    console.error("[usage] skipped:", (e as Error).message, input.kind);
  }
}
