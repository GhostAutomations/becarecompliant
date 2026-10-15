import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Be Care Compliant: the real cost of each text (Phil, 2026-10-15; docs/decisions/sms-one-segment.md).
 *
 * Twilio does not know a message's price when it accepts it: the price is filled in once the
 * network reports back, usually within minutes, in rare cases up to a day later (Twilio's own
 * guidance: fetch the Message resource after it is delivered, and reconcile daily). So the cost is
 * not written at send time. This reads back the texts of the last 45 days that have no price
 * yet and records what Twilio charged: cost_pence when the account is billed in pounds, and always
 * the price, its currency and the segment count Twilio settled on in the row's metadata.
 *
 * Run by the morning job. Never throws; never logs the
 * credentials or the address that carries them.
 */

type UsageRow = { id: string; ref: string | null; metadata: Record<string, unknown> | null };

export async function fillSmsCosts(limit = 60): Promise<{ checked: number; priced: number; failed: number }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const out = { checked: 0, priced: 0, failed: 0 };
  if (!sid || !token) return out;
  const service = createServiceClient();
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const { data, error } = await service
    .from("usage_events")
    .select("id, ref, metadata")
    .eq("kind", "sms")
    .is("cost_pence", null)
    .not("ref", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[sms-costs] could not read usage:", error.message);
    return out;
  }
  const auth = `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
  for (const row of (data as UsageRow[] | null) ?? []) {
    if (!row.ref || !/^(SM|MM)[0-9a-f]{32}$/i.test(row.ref)) continue;
    // Already priced in another currency: nothing more to learn.
    if (row.metadata && typeof row.metadata.price === "string") continue;
    out.checked += 1;
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${row.ref}.json`, {
        headers: { Authorization: auth },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        out.failed += 1;
        continue;
      }
      const m = (await res.json()) as { price?: string | null; price_unit?: string | null; num_segments?: string | null };
      if (m.price == null || m.price === "") continue; // Not priced yet; tried again next time.
      const amount = Math.abs(Number(m.price));
      if (!Number.isFinite(amount)) continue;
      const unit = String(m.price_unit ?? "").toUpperCase();
      const segments = Number(m.num_segments ?? "");
      const { error: upErr } = await service
        .from("usage_events")
        .update({
          ...(unit === "GBP" ? { cost_pence: Math.round(amount * 100) } : {}),
          ...(Number.isFinite(segments) && segments > 0 ? { units: segments } : {}),
          metadata: { ...(row.metadata ?? {}), price: m.price, price_unit: unit },
        })
        .eq("id", row.id);
      if (upErr) out.failed += 1;
      else out.priced += 1;
    } catch {
      out.failed += 1;
    }
  }
  return out;
}
