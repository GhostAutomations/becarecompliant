import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * AI credits: one AI request (pressing an AI button, e.g. a complaint response) costs
 * one credit. Companies get a monthly grant by tier (Business 25, Pro 50) that carries
 * over, plus top-ups. Enforcement lives HERE, not the UI: an AI action calls
 * spendAiCredit BEFORE the AI call, and refundAiCredit if the call then fails, so a
 * failed request never burns a credit.
 */

export const OUT_OF_CREDITS =
  "You are out of AI credits. Top up in Billing to keep using AI features, or wait for next month's allowance.";

/** Current AI credit balance for a company (0 if none set up yet). */
export async function getAiCreditBalance(companyId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_ai_credits")
    .select("balance")
    .eq("company_id", companyId)
    .maybeSingle();
  return (data?.balance as number | null) ?? 0;
}

/**
 * Try to spend one credit for the company. Returns { ok: true, remaining } when a
 * credit was deducted, or { ok: false } when the balance is zero. Atomic in the DB.
 */
export async function spendAiCredit(
  companyId: string,
): Promise<{ ok: true; remaining: number } | { ok: false }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("spend_ai_credit", { cid: companyId });
  const remaining = typeof data === "number" ? data : -1;
  if (error || remaining < 0) return { ok: false };
  return { ok: true, remaining };
}

/** Give a credit back when a paid-for AI call failed after we deducted it. Best effort.
 *  grant_ai_credits is service-role only, so this goes through the service client. */
export async function refundAiCredit(companyId: string): Promise<void> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const admin = createServiceClient();
    await admin.rpc("grant_ai_credits", { cid: companyId, amount: 1, p_reason: "refund", p_ref: null });
  } catch (e) {
    console.error("[ai-credits] refund failed:", (e as Error).message);
  }
}
