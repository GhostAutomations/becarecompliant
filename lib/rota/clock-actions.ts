"use server";

import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { rotaModuleOn } from "@/lib/rota/access";
import { isRotaOfficeRole } from "@/lib/rota/roles";
import { londonWallToUtc } from "@/lib/rota/working-time";
import { mapLink } from "@/lib/rota/map";

/**
 * Be Care Compliant: the office's clock in actions (Rota and Visits Stage 3, Phil 2026-10-16).
 * Office roles only (Supervisor and up, and the Founder): adding a missed clock in or out with a
 * reason, setting a place's map point and radius, printing a new sheet, and clearing a refused
 * record. The database functions check the module, the branch and every rule again. Like the
 * other rota actions, they reply with their result only and the screen refreshes itself.
 */

const UUID = /^[0-9a-f-]{36}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

async function office() {
  const { user, profile } = await requireCompany();
  const companyId = profile.company_id;
  if (!companyId || !(await rotaModuleOn(companyId)) || !isRotaOfficeRole(profile.role)) {
    return { error: "The rota is not available." as const };
  }
  return { user, profile, companyId };
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Add a missed clock in or out: marked "Added by the office", never over the carer's own. */
export async function officeAddClockAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const targetKind = str(fd, "target_kind");
  const targetId = str(fd, "target_id");
  const personId = str(fd, "person_id");
  const kind = str(fd, "kind");
  const date = str(fd, "date");
  const time = str(fd, "time");
  const reason = str(fd, "reason");
  if (!["visit", "shift"].includes(targetKind) || !UUID.test(targetId) || !UUID.test(personId) || !["in", "out"].includes(kind)) {
    return { error: "That visit or shift could not be found." };
  }
  if (!ISO.test(date) || !TIME.test(time)) return { error: "Enter the date and time it happened." };
  if (!reason) return { error: "Give a reason for adding it." };
  if (reason.length > 500) return { error: "Keep the reason under 500 characters." };
  const at = new Date(londonWallToUtc(date, time)).toISOString();
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_office_add_clock", {
    p_target_kind: targetKind, p_target: targetId, p_person: personId, p_kind: kind, p_at: at, p_reason: reason,
  });
  if (error) return { error: error.message };
  await writeAudit({
    companyId: g.companyId,
    action: kind === "in" ? "rota.clock_in_added" : "rota.clock_out_added",
    entityType: targetKind === "visit" ? "rota_visit" : "rota_shift",
    entityId: targetId,
    summary: `Clock ${kind} added by the office (${date} ${time}): ${reason}`,
    metadata: { person_id: personId, at },
  });
  return { ok: `Clock ${kind} added for ${time}.` };
}

async function placeInfo(placeId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("rota_places").select("id, service_user_id, branch_id, for_branch").eq("id", placeId).maybeSingle();
  return data as { id: string; service_user_id: string | null; branch_id: string; for_branch: boolean } | null;
}

/** "Set from where I am standing": the office user's phone position, at the home or branch. */
export async function setPlaceHereAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const placeId = str(fd, "place_id");
  const lat = Number(str(fd, "lat"));
  const lng = Number(str(fd, "lng"));
  const accuracy = Number(str(fd, "accuracy"));
  if (!UUID.test(placeId)) return { error: "That place could not be found." };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracy)) {
    return { error: "Your phone did not give a position. Allow location for this site, then try again." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_set_place", { p_place: placeId, p_lat: lat, p_lng: lng, p_source: "on_site", p_postcode: null, p_accuracy: accuracy });
  if (error) return { error: error.message };
  const info = await placeInfo(placeId);
  await writeAudit({
    companyId: g.companyId,
    action: "rota.place_set",
    entityType: info?.for_branch ? "branch" : "service_user",
    entityId: info?.for_branch ? info.branch_id : info?.service_user_id ?? null,
    summary: `Clock in point set from where the office was standing (accurate to ${Math.round(accuracy)} m)`,
    metadata: { place_id: placeId, source: "on_site", accuracy },
  });
  return { ok: `Point set (accurate to ${Math.round(accuracy)} m).` };
}

/** A pin dragged on the map in the office. */
export async function setPlaceMapAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const placeId = str(fd, "place_id");
  const lat = Number(str(fd, "lat"));
  const lng = Number(str(fd, "lng"));
  if (!UUID.test(placeId)) return { error: "That place could not be found." };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: "Drop the pin on the map first." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_set_place", { p_place: placeId, p_lat: lat, p_lng: lng, p_source: "map", p_postcode: null, p_accuracy: null });
  if (error) return { error: error.message };
  const info = await placeInfo(placeId);
  await writeAudit({
    companyId: g.companyId,
    action: "rota.place_set",
    entityType: info?.for_branch ? "branch" : "service_user",
    entityId: info?.for_branch ? info.branch_id : info?.service_user_id ?? null,
    summary: "Clock in point set on the map",
    metadata: { place_id: placeId, source: "map" },
  });
  return { ok: "Point saved." };
}

export async function setPlaceRadiusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const placeId = str(fd, "place_id");
  const radius = Number(str(fd, "radius"));
  if (!UUID.test(placeId)) return { error: "That place could not be found." };
  if (!Number.isInteger(radius) || radius < 25 || radius > 2000) return { error: "The radius must be a whole number between 25 and 2,000 metres." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_set_place_radius", { p_place: placeId, p_radius: radius });
  if (error) return { error: error.message };
  const info = await placeInfo(placeId);
  await writeAudit({
    companyId: g.companyId,
    action: "rota.place_radius",
    entityType: info?.for_branch ? "branch" : "service_user",
    entityId: info?.for_branch ? info.branch_id : info?.service_user_id ?? null,
    summary: `Clock in radius set to ${radius} m`,
    metadata: { place_id: placeId, radius },
  });
  return { ok: `Radius saved (${radius} m).` };
}

/** A new printed sheet: new QR code and text code; the old sheet and any sticker stop working. */
export async function newSheetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const placeId = str(fd, "place_id");
  if (!UUID.test(placeId)) return { error: "That place could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_new_sheet", { p_place: placeId });
  if (error) return { error: error.message };
  const info = await placeInfo(placeId);
  await writeAudit({
    companyId: g.companyId,
    action: "rota.place_new_sheet",
    entityType: info?.for_branch ? "branch" : "service_user",
    entityId: info?.for_branch ? info.branch_id : info?.service_user_id ?? null,
    summary: "New clock in sheet: the old QR code, sticker and text code no longer work",
    metadata: { place_id: placeId },
  });
  return { ok: "New sheet made. Print it, and replace the old sheet and any sticker." };
}

export async function resolveClockProblemAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  const id = str(fd, "problem_id");
  if (!UUID.test(id)) return { error: "That record could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_resolve_clock_problem", { p_problem: id });
  if (error) return { error: error.message };
  return { ok: "Cleared." };
}

/** A one hour link to our own UK map file, for the office map pin. */
export async function mapLinkAction(): Promise<{ url?: string; error?: string }> {
  const g = await office();
  if ("error" in g) return { error: g.error };
  return mapLink();
}
