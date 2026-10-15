import "server-only";
import { createClient } from "@/lib/supabase/server";
import { postcodePoints } from "@/lib/rota/postcodes";
import { locationWords } from "@/lib/rota/clock";
import type { ClockRecord } from "@/lib/rota/types";

/**
 * Be Care Compliant: what the office reads about clock ins (Rota and Visits Stage 3). Read under
 * the office's own RLS (rota_clock_events, rota_places, rota_clock_problems: office branches only).
 */

/** Clock records for these visits or shifts, oldest first, grouped by visit or shift. */
export async function getClockRecords(kind: "visit" | "shift", ids: string[]): Promise<Map<string, ClockRecord[]>> {
  const out = new Map<string, ClockRecord[]>();
  if (ids.length === 0) return out;
  const supabase = await createClient();
  const col = kind === "visit" ? "visit_id" : "shift_id";
  const { data } = await supabase
    .from("rota_clock_events")
    .select(`id, ${col}, person_id, kind, happened_at, method, location, distance_m, reason_code, reason_text, flags, added_reason`)
    .in(col, ids)
    .order("happened_at");
  type R = {
    id: string; visit_id?: string; shift_id?: string; person_id: string; kind: "in" | "out"; happened_at: string; method: string;
    location: string; distance_m: number | null; reason_code: string | null; reason_text: string | null; flags: string[] | null; added_reason: string | null;
  };
  for (const r of (data as unknown as R[] | null) ?? []) {
    const key = (kind === "visit" ? r.visit_id : r.shift_id) as string;
    const list = out.get(key) ?? [];
    list.push({
      id: r.id,
      personId: r.person_id,
      kind: r.kind,
      at: r.happened_at,
      method: r.method,
      location: r.location,
      words: locationWords(r),
      flags: r.flags ?? [],
      addedReason: r.added_reason,
    });
    out.set(key, list);
  }
  return out;
}

export type PlaceRow = {
  placeId: string;
  serviceUserId: string | null;
  forBranch: boolean;
  name: string;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  radius: number;
  source: "postcode" | "map" | "on_site";
};

/**
 * The branch's places (each service user's home and the branch office), made if missing, with a
 * postcode point filled in where the office has not set one (postcodes.io, only the postcode is
 * sent). A point the office set on the map or at the home is never replaced by a postcode.
 */
export async function getBranchPlaces(branchId: string): Promise<PlaceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rota_ensure_places", { p_branch: branchId });
  if (error) throw new Error(`The places could not be read: ${error.message}`);
  type R = { place_id: string; service_user_id: string | null; for_branch: boolean; name: string; postcode: string | null; lat: number | null; lng: number | null; radius_m: number; source: PlaceRow["source"] };
  const rows = ((data as R[] | null) ?? []).map((r) => ({
    placeId: r.place_id, serviceUserId: r.service_user_id, forBranch: r.for_branch, name: r.name, postcode: r.postcode,
    lat: r.lat, lng: r.lng, radius: r.radius_m, source: r.source,
  }));
  const needPoint = rows.filter((r) => r.source === "postcode" && r.postcode && r.lat == null);
  if (needPoint.length) {
    const points = await postcodePoints(needPoint.map((r) => r.postcode));
    for (const r of needPoint) {
      const pt = points.get(r.postcode as string);
      if (!pt) continue;
      const { error: setErr } = await supabase.rpc("rota_set_place", { p_place: r.placeId, p_lat: pt.lat, p_lng: pt.lng, p_source: "postcode", p_postcode: r.postcode, p_accuracy: null });
      if (!setErr) {
        r.lat = pt.lat;
        r.lng = pt.lng;
      }
    }
  }
  return rows;
}

/** Records the server refused from carers' phones, still to be looked at. */
export async function getClockProblems(branchId: string): Promise<{ id: string; reason: string; at: string; name: string | null; kind: string | null }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rota_clock_problems")
    .select("id, reason, created_at, event, people(full_name)")
    .eq("branch_id", branchId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  type R = { id: string; reason: string; created_at: string; event: { kind?: string } | null; people: { full_name: string | null } | null };
  return ((data as unknown as R[] | null) ?? []).map((r) => ({ id: r.id, reason: r.reason, at: r.created_at, name: r.people?.full_name ?? null, kind: r.event?.kind ?? null }));
}
