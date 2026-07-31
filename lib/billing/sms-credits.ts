import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * SMS credits: one text message costs one credit.
 *
 * Companies get a monthly grant by tier (Business 0, Pro 100, Enterprise 250, Diamond 500, Black
 * 2000) that carries over, plus top ups. Enforcement lives HERE and in the database, not in the
 * UI: `sendSms` claims a credit BEFORE it calls Twilio and hands it back if the send fails, so a
 * failed message never costs the customer anything and a company at zero simply stops sending.
 *
 * WHY A HARD STOP. Every text is real money leaving Phil's Twilio account. Without a ceiling one
 * customer with a large register and a bad month could run up a bill nobody agreed to, and the
 * first anyone would know is the invoice.
 *
 * SERVICE ROLE, deliberately. The escalation texts are sent by the nightly digest cron, which has
 * no signed in user, so these calls go through the service client. `spend_sms_credit` still
 * refuses a signed in caller who is not a member of the company being charged.
 */

export const OUT_OF_SMS_CREDITS =
  "This company has used its SMS allowance for the month. Top up in Billing, or wait for next month's allowance.";

/** Current SMS credit balance for a company (0 when none has been set up yet). */
export async function getSmsCreditBalance(companyId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_sms_credits")
    .select("balance")
    .eq("company_id", companyId)
    .maybeSingle();
  return (data?.balance as number | null) ?? 0;
}

/**
 * Try to spend one credit. `{ ok: true, remaining }` when one was deducted, `{ ok: false }` when
 * the balance is zero. Atomic in the database, so two sends at the same moment cannot both take
 * the last credit.
 */
export type SpendResult =
  | { ok: true; remaining: number }
  /** The balance is genuinely zero. */
  | { ok: false; reason: "no_credits" }
  /** We could not tell. A different thing entirely, and it must not be reported to a customer as
   *  "you have used your allowance" when the truth is that the database did not answer. */
  | { ok: false; reason: "error"; detail: string };

export async function spendSmsCredit(companyId: string): Promise<SpendResult> {
  const { data, error } = await createServiceClient().rpc("spend_sms_credit", { cid: companyId });
  if (error) {
    console.error("[sms-credits] spend failed:", error.message);
    return { ok: false, reason: "error", detail: error.message };
  }
  const remaining = typeof data === "number" ? data : -1;
  if (remaining < 0) return { ok: false, reason: "no_credits" };
  return { ok: true, remaining };
}

/** Give a credit back when the send failed after it was deducted. Best effort: a refund that
 *  fails must not turn into a thrown error on top of an already failed message. */
export async function refundSmsCredit(companyId: string): Promise<void> {
  try {
    // The Supabase client does NOT throw on a failed RPC, it returns { error }. Only catching
    // exceptions meant a refused refund vanished without a word, which is exactly the promise
    // this function exists to keep.
    const { error } = await createServiceClient().rpc("grant_sms_credits", {
      cid: companyId,
      amount: 1,
      p_reason: "refund",
      p_ref: null,
    });
    if (error) console.error("[sms-credits] refund refused:", error.message, companyId);
  } catch (e) {
    console.error("[sms-credits] refund failed:", (e as Error).message);
  }
}
