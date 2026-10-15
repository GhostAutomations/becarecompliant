import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { normalisePostcode, type Point } from "@/lib/rota/geo";

/**
 * Be Care Compliant: postcode map points for the visit recommendation (Stage 2, Phil 2026-10-15).
 *
 * Looked up once through postcodes.io (ONS data; bulk lookup of up to 100 postcodes per request)
 * and stored in rota_postcode_points, so a postcode is never looked up twice. Only the postcode is
 * sent, never a name. A postcode that is not found is stored as not found, so it is not asked
 * again. If postcodes.io cannot be reached, the recommendation simply shows no distance.
 */

const BULK_URL = "https://api.postcodes.io/postcodes";

export async function postcodePoints(raw: (string | null | undefined)[]): Promise<Map<string, Point>> {
  const wanted = [...new Set(raw.map((r) => normalisePostcode(r)).filter((p): p is string => !!p))];
  const out = new Map<string, Point>();
  if (wanted.length === 0) return out;
  const service = createServiceClient();
  const { data: known } = await service.from("rota_postcode_points").select("postcode, lat, lng, found").in("postcode", wanted);
  const have = new Set<string>();
  for (const k of (known as { postcode: string; lat: number | null; lng: number | null; found: boolean }[] | null) ?? []) {
    have.add(k.postcode);
    if (k.found && k.lat != null && k.lng != null) out.set(k.postcode, { lat: k.lat, lng: k.lng });
  }
  const missing = wanted.filter((p) => !have.has(p));
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    try {
      const res = await fetch(BULK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcodes: batch }),
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { result?: { query: string; result: { latitude: number | null; longitude: number | null } | null }[] };
      const rows = (body.result ?? []).map((r) => {
        const postcode = normalisePostcode(r.query) ?? r.query;
        const lat = r.result?.latitude ?? null;
        const lng = r.result?.longitude ?? null;
        const found = lat != null && lng != null;
        if (found) out.set(postcode, { lat: lat as number, lng: lng as number });
        return { postcode, lat, lng, found, looked_up_at: new Date().toISOString() };
      });
      if (rows.length) await service.from("rota_postcode_points").upsert(rows, { onConflict: "postcode" });
    } catch (e) {
      console.error("[rota-postcodes] lookup failed:", e instanceof Error ? e.message : e);
    }
  }
  return out;
}
