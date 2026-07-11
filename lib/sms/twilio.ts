import "server-only";
import { recordUsage } from "@/lib/notifications/usage";

/**
 * Twilio SMS sender (REST API, no SDK dependency, mirroring lib/email/resend.ts).
 *
 * Dependencies: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (server-only
 * env, never NEXT_PUBLIC_). Missing config is a silent no-op with skippedReason
 * set so callers surface "SMS not sent" instead of crashing.
 *
 * METERING IS NOT OPTIONAL: every successful send writes a usage_events row
 * (kind 'sms', units = message segments from Twilio's num_segments) so Diamond
 * tier billing and per-company usage visibility are exact from the first send.
 */

export type SmsResult = {
  sent: boolean;
  sid?: string;
  segments?: number;
  skippedReason?: string;
  error?: string;
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
      return {
        sent: false,
        error: `Twilio ${res.status}: ${payload.message ?? "send failed"}`,
      };
    }

    const segments = Number(payload.num_segments ?? "1") || 1;
    await recordUsage({
      companyId: opts.companyId,
      kind: "sms",
      units: segments,
      ref: payload.sid ?? null,
      metadata: { to: opts.to, ...(opts.metadata ?? {}) },
    });

    return { sent: true, sid: payload.sid, segments };
  } catch (e) {
    return { sent: false, error: (e as Error).message };
  }
}
