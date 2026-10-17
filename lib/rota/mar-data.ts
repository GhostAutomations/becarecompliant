import "server-only";
import { createClient } from "@/lib/supabase/server";
import { dueAt, type DoseOutcome, type Support } from "@/lib/rota/mar";

/**
 * Be Care Compliant: reading a service user's MAR for the office (Rota and Visits Stage 6). Read as
 * the signed in office person, so RLS keeps them to their own branches.
 */

export type MarMed = {
  id: string;
  medUid: string;
  dmdId: string | null;
  name: string;
  form: string | null;
  route: string | null;
  doseText: string;
  doseQuantity: number | null;
  doseUnit: string | null;
  support: Support;
  prn: boolean;
  slots: string[];
  days: number[] | null;
  timeSensitive: boolean;
  instructions: string | null;
  startDate: string;
  stopDate: string | null;
  reviewDate: string | null;
  status: "awaiting_check" | "live" | "replaced" | "stopped";
  setBy: string | null;
  setByName: string | null;
  setAt: string;
  checkedByName: string | null;
  checkedAt: string | null;
  stoppedAt: string | null;
  stopReason: string | null;
  /** A photo of the label or prescription was attached (0503); or why not. */
  hasLabel: boolean;
  labelSkipReason: string | null;
};

export type MarDose = {
  id: string;
  visitId: string;
  medUid: string;
  author: string;
  slot: string;
  outcome: DoseOutcome;
  reasonCode: string | null;
  reasonText: string | null;
  quantity: number | null;
  at: string;
  flags: string[];
};

export type MarVisit = { id: string; date: string; startTime: string; startsAt: string; slot: string; clockedOut: boolean };

export type MarData = {
  meds: MarMed[];          // live, waiting and stopped (newest version of each medicine)
  balances: Record<string, number | null>;
  doses: MarDose[];        // the window's doses
  visits: MarVisit[];      // the window's published visits
  release: { release: string; loadedAt: string } | null;
  dmdCount: number;
};

type MedRow = {
  id: string; med_uid: string; dmd_id: string | null; name: string; form: string | null; route: string | null; dose_text: string;
  dose_quantity: number | string | null; dose_unit: string | null; support: Support; prn: boolean; slots: string[]; days: number[] | null;
  time_sensitive: boolean; instructions: string | null; start_date: string; stop_date: string | null; review_date: string | null;
  status: MarMed["status"]; set_by: string | null; set_at: string; checked_by: string | null; checked_at: string | null;
  stopped_at: string | null; stop_reason: string | null; created_at: string; label_path: string | null; label_skip_reason: string | null;
};

export async function getMar(serviceUserId: string, fromIso: string, toIso: string): Promise<MarData> {
  const supabase = await createClient();
  const [{ data: medRows }, { data: stock }, { data: doseRows }, { data: visitRows }, { data: release }, { count }] = await Promise.all([
    supabase
      .from("rota_mar_medicines")
      .select("id, med_uid, dmd_id, name, form, route, dose_text, dose_quantity, dose_unit, support, prn, slots, days, time_sensitive, instructions, start_date, stop_date, review_date, status, set_by, set_at, checked_by, checked_at, stopped_at, stop_reason, created_at, label_path, label_skip_reason")
      .eq("service_user_id", serviceUserId)
      .in("status", ["live", "awaiting_check", "stopped"])
      .order("created_at", { ascending: false }),
    supabase.from("rota_mar_stock").select("med_uid, change").eq("service_user_id", serviceUserId),
    supabase
      .from("rota_mar_doses")
      .select("id, visit_id, med_uid, author_name, slot, outcome, reason_code, reason_text, quantity, happened_at, flags")
      .eq("service_user_id", serviceUserId)
      .gte("happened_at", `${fromIso}T00:00:00Z`)
      .order("happened_at"),
    supabase
      .from("rota_visits")
      .select("id, visit_date, start_time, starts_at, generated_key, rota_clock_events(kind)")
      .eq("service_user_id", serviceUserId)
      .eq("status", "published")
      .gte("visit_date", fromIso)
      .lte("visit_date", toIso)
      .order("starts_at"),
    supabase.from("dmd_releases").select("release, loaded_at").eq("status", "loaded").order("loaded_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("dmd_products").select("id", { count: "exact", head: true }),
  ]);

  const rows = (medRows as MedRow[] | null) ?? [];
  // One per medicine: a stopped one only if nothing newer, else the live or waiting rows.
  const byUid = new Map<string, MedRow[]>();
  for (const r of rows) byUid.set(r.med_uid, [...(byUid.get(r.med_uid) ?? []), r]);
  const people = new Set<string>();
  for (const r of rows) {
    if (r.set_by) people.add(r.set_by);
    if (r.checked_by) people.add(r.checked_by);
  }
  const { data: profs } = people.size ? await supabase.from("profiles").select("id, full_name").in("id", [...people]) : { data: [] };
  const nameOf = new Map(((profs as { id: string; full_name: string | null }[] | null) ?? []).map((p) => [p.id, p.full_name ?? "Someone"]));
  const toMed = (r: MedRow): MarMed => ({
    id: r.id, medUid: r.med_uid, dmdId: r.dmd_id, name: r.name, form: r.form, route: r.route, doseText: r.dose_text,
    doseQuantity: r.dose_quantity == null ? null : Number(r.dose_quantity), doseUnit: r.dose_unit, support: r.support, prn: r.prn,
    slots: r.slots ?? [], days: r.days, timeSensitive: r.time_sensitive, instructions: r.instructions, startDate: r.start_date,
    stopDate: r.stop_date, reviewDate: r.review_date, status: r.status, setBy: r.set_by, setByName: r.set_by ? nameOf.get(r.set_by) ?? null : null,
    setAt: r.set_at, checkedByName: r.checked_by ? nameOf.get(r.checked_by) ?? null : null, checkedAt: r.checked_at,
    stoppedAt: r.stopped_at, stopReason: r.stop_reason, hasLabel: Boolean(r.label_path), labelSkipReason: r.label_skip_reason,
  });
  const meds: MarMed[] = [];
  for (const list of byUid.values()) {
    const current = list.filter((r) => r.status !== "stopped");
    if (current.length) meds.push(...current.map(toMed));
    else meds.push(toMed(list[0]));
  }

  const balances: Record<string, number | null> = {};
  for (const s of (stock as { med_uid: string; change: number | string }[] | null) ?? []) {
    balances[s.med_uid] = (balances[s.med_uid] ?? 0) + Number(s.change);
  }

  type D = { id: string; visit_id: string; med_uid: string; author_name: string; slot: string; outcome: DoseOutcome; reason_code: string | null; reason_text: string | null; quantity: number | string | null; happened_at: string; flags: string[] | null };
  type V = { id: string; visit_date: string; start_time: string; starts_at: string; generated_key: string | null; rota_clock_events: { kind: string }[] | null };
  return {
    meds,
    balances,
    doses: ((doseRows as D[] | null) ?? []).map((d) => ({
      id: d.id, visitId: d.visit_id, medUid: d.med_uid, author: d.author_name, slot: d.slot, outcome: d.outcome, reasonCode: d.reason_code,
      reasonText: d.reason_text, quantity: d.quantity == null ? null : Number(d.quantity), at: d.happened_at, flags: d.flags ?? [],
    })),
    visits: ((visitRows as unknown as V[] | null) ?? []).map((v) => ({
      id: v.id, date: v.visit_date, startTime: v.start_time.slice(0, 5), startsAt: v.starts_at,
      slot: (v.generated_key ?? "").split(":")[3] ?? "", clockedOut: (v.rota_clock_events ?? []).some((c) => c.kind === "out"),
    })),
    release: release ? { release: (release as { release: string }).release, loadedAt: (release as { loaded_at: string }).loaded_at } : null,
    dmdCount: count ?? 0,
  };
}

/** Each visit's regular doses that were due, with what was recorded (latest per medicine), for a grid. */
export function dueGrid(data: MarData): { visit: MarVisit; med: MarMed; dose: MarDose | null }[] {
  const live = data.meds.filter((m) => m.status === "live" && !m.prn);
  const out: { visit: MarVisit; med: MarMed; dose: MarDose | null }[] = [];
  for (const v of data.visits) {
    for (const m of live) {
      if (!dueAt({ prn: m.prn, slots: m.slots, days: m.days, start_date: m.startDate, stop_date: m.stopDate, dose_quantity: m.doseQuantity }, v.date, v.slot)) continue;
      const doses = data.doses.filter((d) => d.visitId === v.id && d.medUid === m.medUid);
      out.push({ visit: v, med: m, dose: doses[doses.length - 1] ?? null });
    }
  }
  return out;
}
