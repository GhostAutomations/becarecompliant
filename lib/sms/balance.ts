import "server-only";
import { unstable_cache } from "next/cache";

/**
 * Be Care Compliant: the Twilio account balance, for the Founder console (Phil, 2026-10-15;
 * docs/decisions/sms-one-segment.md).
 *
 * Twilio's Balance resource: GET /2010-04-01/Accounts/{AccountSid}/Balance.json with the account's
 * own SID and Auth Token, the credentials the app already sends texts with. Read on the server
 * only, cached for 15 minutes (Refresh clears it), and with a 5 second limit so a slow Twilio can
 * never hold the console up; the tile is streamed in on its own anyway. When it cannot be read the
 * answer says why, never a silent zero. The credentials and the address that carries the SID are
 * never logged or shown.
 */

export const TWILIO_BALANCE_TAG = "twilio-balance";

export { balanceTone } from "@/lib/sms/balance-tone";

export type TwilioBalance =
  | { ok: true; balance: number; currency: string; checkedAt: string }
  | { ok: false; reason: string; checkedAt: string };

async function readBalance(): Promise<TwilioBalance> {
  const checkedAt = new Date().toISOString();
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    return { ok: false, reason: "Twilio is not set up on this site (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN).", checkedAt };
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`, {
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "Twilio refused the credentials for the balance.", checkedAt };
    }
    if (!res.ok) return { ok: false, reason: `Twilio answered ${res.status}.`, checkedAt };
    const body = (await res.json()) as { balance?: string; currency?: string };
    const balance = Number(body.balance);
    if (!Number.isFinite(balance)) return { ok: false, reason: "Twilio did not return a balance.", checkedAt };
    return { ok: true, balance, currency: String(body.currency ?? "").toUpperCase(), checkedAt };
  } catch (e) {
    const timedOut = (e as Error).name === "TimeoutError" || (e as Error).name === "AbortError";
    return { ok: false, reason: timedOut ? "Twilio did not answer in time." : "Twilio could not be reached.", checkedAt };
  }
}

export const getTwilioBalance = unstable_cache(readBalance, ["twilio-balance-v1"], {
  revalidate: 900,
  tags: [TWILIO_BALANCE_TAG],
});
