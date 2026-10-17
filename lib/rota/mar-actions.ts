"use server";

import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/forms";
import { rotaModuleOn } from "@/lib/rota/access";

/**
 * Be Care Compliant: the office's MAR actions (Rota and Visits Stage 6, Phil's popups 2026-10-17).
 * The database checks the caller is the rota office of the service user's branch, the second check
 * rules, the reasons and the stock rules, and writes the audit lines. These reply with the result
 * only; the screen refreshes itself.
 */

const UUID = /^[0-9a-f-]{36}$/i;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function guard() {
  const { profile } = await requireCompany();
  if (!profile.company_id || !(await rotaModuleOn(profile.company_id))) return { error: "The MAR is not available." as const };
  return { profile };
}

export type DmdHit = { id: string; name: string; form: string | null; routes: string[] };

/** Search the NHS list by name: every word typed must appear, current products first. */
export async function searchDmdAction(term: string): Promise<{ hits?: DmdHit[]; error?: string }> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const words = term.toLowerCase().replace(/[%_\\]/g, " ").split(/\s+/).filter((w) => w.length >= 2).slice(0, 5);
  if (words.length === 0) return { hits: [] };
  const supabase = await createClient();
  let q = supabase.from("dmd_products").select("id, name, form, routes").eq("invalid", false);
  for (const w of words) q = q.ilike("name", `%${w}%`);
  const { data, error } = await q.order("name").limit(25);
  if (error) return { error: error.message };
  return { hits: (data as DmdHit[] | null) ?? [] };
}

/** Add a medicine, or change one: a new version waiting for its second check. */
export async function saveMedicineAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const su = str(fd, "service_user_id");
  const medUid = str(fd, "med_uid");
  if (!UUID.test(su)) return { error: "That service user could not be found." };
  const prn = fd.get("prn") === "on";
  const slots = fd.getAll("slots").map(String);
  const days = fd.getAll("days").map((d) => Number(d)).filter((d) => d >= 0 && d <= 6);
  const qtyRaw = str(fd, "dose_quantity");
  const qty = qtyRaw ? Number(qtyRaw) : null;
  if (qty != null && !(qty > 0 && qty <= 1000)) return { error: "The quantity in each dose must be more than 0." };
  const name = str(fd, "name");
  if (!name) return { error: "Choose the medicine from the NHS list." };
  if (!str(fd, "dose_text")) return { error: "Enter the dose exactly as it is on the label." };
  if (!prn && slots.length === 0) return { error: "Choose at least one call it is given at, or tick When required." };
  const start = str(fd, "start_date");
  const stop = str(fd, "stop_date");
  if (stop && start && stop < start) return { error: "The stop date is before the start date." };
  const data = {
    name,
    dmd_id: str(fd, "dmd_id") || null,
    form: str(fd, "form") || null,
    route: str(fd, "route") || null,
    dose_text: str(fd, "dose_text"),
    dose_quantity: qty,
    dose_unit: str(fd, "dose_unit") || null,
    support: ["prompt", "assist", "give"].includes(str(fd, "support")) ? str(fd, "support") : "give",
    prn,
    slots: prn ? [] : slots,
    days: days.length && days.length < 7 ? days : null,
    time_sensitive: fd.get("time_sensitive") === "on",
    instructions: str(fd, "instructions") || null,
    start_date: start || null,
    stop_date: stop || null,
    review_date: str(fd, "review_date") || null,
  };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_mar_save", { p_su: su, p_med_uid: UUID.test(medUid) ? medUid : null, p_data: data });
  if (error) return { error: error.message };
  return { ok: "Saved. It needs a second check by another Supervisor or above before carers can record it." };
}

export async function checkMedicineAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const id = str(fd, "medicine_id");
  if (!UUID.test(id)) return { error: "That medicine could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_mar_check", { p_medicine: id });
  if (error) return { error: error.message };
  return { ok: "Checked. It is live for carers now." };
}

export async function withdrawMedicineAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const id = str(fd, "medicine_id");
  if (!UUID.test(id)) return { error: "That medicine could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_mar_withdraw", { p_medicine: id });
  if (error) return { error: error.message };
  return { ok: "Withdrawn." };
}

export async function stopMedicineAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const uid = str(fd, "med_uid");
  const reason = str(fd, "reason");
  if (!UUID.test(uid)) return { error: "That medicine could not be found." };
  if (!reason) return { error: "Say why it is stopped." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_mar_stop", { p_med_uid: uid, p_reason: reason });
  if (error) return { error: error.message };
  return { ok: "Stopped." };
}

export async function stockMedicineAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const uid = str(fd, "med_uid");
  const kind = str(fd, "kind");
  const qty = Number(str(fd, "quantity"));
  if (!UUID.test(uid)) return { error: "That medicine could not be found." };
  if (kind !== "received" && kind !== "corrected") return { error: "Choose received or a correction." };
  if (!Number.isFinite(qty) || qty === 0) return { error: "Enter the quantity." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rota_mar_stock_change", { p_med_uid: uid, p_change: qty, p_kind: kind, p_reason: str(fd, "reason") || null });
  if (error) return { error: error.message };
  return { ok: kind === "received" ? "Stock added." : "Count corrected." };
}
