import "server-only";
import { recordUsage } from "@/lib/notifications/usage";
import { spendSmsCredit, refundSmsCredit, OUT_OF_SMS_CREDITS } from "@/lib/billing/sms-credits";

/**
 * Twilio SMS sender (REST API, no SDK dependency, mirroring lib/email/resend.ts).
 *
 * Dependencies: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (server-only
 * env, never NEXT_PUBLIC_). Missing config is a silent no-op with skippedReason
 * set so callers surface "SMS not sent" instead of crashing.
 *
 * METERING IS NOT OPTIONAL: every successful send writes a usage_events row
 * (kind 'sms', units = message segments from Twilio's num_segments) so per company usage
 * visibility is exact from the first send.
 *
 * NEITHER IS THE ALLOWANCE (2026-07-31). A credit is claimed BEFORE Twilio is called and handed
 * back if the send fails, exactly as runAi does with AI credits. A company at zero stops sending
 * rather than running up a bill nobody agreed to, and the caller is told which of the two it was:
 * `skippedReason` for "no allowance left", `error` for "Twilio said no".
 *
 * ONE CREDIT PER MESSAGE, not per segment. Segments are still metered into usage_events for
 * billing, but a customer should not lose three credits because a manager's branch name is long.
 */

export type SmsResult = {
  sent: boolean;
  sid?: string;
  segments?: number;
  skippedReason?: string;
  error?: string;
  /** Credits left after this send, when one was spent. */
  creditsRemaining?: number;
};

export function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM,
  );
}

export async function sendSms(opts: {
  to: string;
  body: string;
  /** Required: every SMS is metered against a company. */
  companyId: string;
  metadata?: Record<string, unknown>;
}): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    return {
      sent: false,
      skippedReason: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM not configured",
    };
  }

  // The allowance is claimed FIRST, so two sends at the same moment cannot both take the last
  // credit, and a company at zero never reaches Twilio at all.
  const spent = await spendSmsCredit(opts.companyId);
  if (!spent.ok) {
    // "You are out of allowance" and "we could not check your allowance" are different things to
    // tell a customer, and only the first should stop us trying again tomorrow.
    return spent.reason === "no_credits"
      ? { sent: false, skippedReason: OUT_OF_SMS_CREDITS }
      : { sent: false, error: `Could not check the SMS allowance: ${spent.detail}` };
  }

  // Set the moment Twilio ACCEPTS the message. After that point nothing may refund the credit:
  // the text is on its way and the customer has had the send.
  let accepted = false;
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: opts.to, From: from, Body: opts.body }),
      },
    );

    const payload = (await res.json().catch(() => ({}))) as {
      sid?: string;
      num_segments?: string;
      message?: string;
    };

    if (!res.ok) {
      // Nothing was sent, so nothing should have been paid for.
      await refundSmsCredit(opts.companyId);
      return {
        sent: false,
        error: `Twilio ${res.status}: ${payload.message ?? "send failed"}`,
      };
    }

    accepted = true;
    const segments = Number(payload.num_segments ?? "1") || 1;
    await recordUsage({
      companyId: opts.companyId,
      kind: "sms",
      units: segments,
      ref: payload.sid ?? null,
      metadata: { to: opts.to, ...(opts.metadata ?? {}) },
    });

    return { sent: true, sid: payload.sid, segments, creditsRemaining: spent.remaining };
  } catch (e) {
    // Only when the message never got away. A socket reset AFTER Twilio accepted it must not hand
    // back a credit for a text the manager received.
    if (!accepted) await refundSmsCredit(opts.companyId);
    return { sent: accepted, error: (e as Error).message };
  }
}
