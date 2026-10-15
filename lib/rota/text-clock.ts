import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms/twilio";

/**
 * Be Care Compliant: clock in by text (Rota and Visits Stage 3, Phil 2026-10-16). Called by the
 * inbound text route for a message that is exactly IN or OUT and a home's five character code.
 *
 * The database does the work (rota_clock_by_text, service role only): it matches the sender's
 * mobile to one staff record in a company with the module on, the code to a home or branch in
 * that company, and the carer's published visit or shift there now. The message's Twilio id is the
 * event id, so a second delivery of the same text is recorded once and answered once.
 *
 * The reply goes through sendSms like every other text: so a test company texts only the
 * Founder's mobiles, an opted out number is never texted, and it uses one credit. A number we
 * cannot tie to a company is never answered (the inbound route's rule: no paid replies to
 * strangers).
 */
export async function clockByText(from: string, clock: { kind: "in" | "out"; code: string }, sid: string): Promise<void> {
  const service = createServiceClient();
  const { data, error } = await service.rpc("rota_clock_by_text", { p_from: from, p_kind: clock.kind, p_code: clock.code, p_sid: sid });
  if (error) {
    console.error("[rota-text-clock] failed:", error.message);
    return;
  }
  const row = ((data as { result: string; message: string | null; company_id: string | null }[] | null) ?? [])[0];
  if (!row || row.result === "duplicate" || row.result === "ignored" || !row.message || !row.company_id) return;
  const sent = await sendSms({ to: from, body: row.message, companyId: row.company_id, metadata: { kind: "rota_clock_reply", result: row.result, ref: sid } });
  if (!sent.sent) console.warn("[rota-text-clock] reply not sent:", sent.skippedReason ?? sent.error);
}
