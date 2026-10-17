import "server-only";

/**
 * Be Care Compliant: reading a Visit record for its PDF (Rota and Visits Stage 5, docs/decisions/
 * rota-visits.md, Stage 5 decision 2). Used by the cloud copy (service role, pinned to the job's
 * company) and the office's PDF download (the signed in person's own client, so RLS decides).
 *
 * A version shows everything the server had received by its made_at; with no version (the office
 * printing a visit not yet clocked out) it shows everything so far.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { renderReportPdf, type ReportDoc } from "@/lib/export/pdf";
import { buildVisitRecord, type VisitRecordInput } from "@/lib/rota/visit-record";
import { dueAt } from "@/lib/rota/mar";

type Db = SupabaseClient;

export type VisitRecordFacts = { input: VisitRecordInput; serviceUserId: string; companyId: string };

export async function loadVisitRecord(
  db: Db,
  opts: { companyId: string; visitId: string; version?: { version: number; madeAt: string } | null },
): Promise<VisitRecordFacts | null> {
  const { data: visit } = await db
    .from("rota_visits")
    .select("id, company_id, branch_id, service_user_id, visit_date, start_time, end_time, service, generated_key")
    .eq("id", opts.visitId)
    .eq("company_id", opts.companyId)
    .maybeSingle<{ id: string; company_id: string; branch_id: string; service_user_id: string; visit_date: string; start_time: string; end_time: string; service: string; generated_key: string | null }>();
  if (!visit) return null;
  const upTo = opts.version?.madeAt ?? null;
  // Only what had arrived by the version's made_at, so a version never changes.
  const rows = (table: string, cols: string) => {
    let q = db.from(table).select(cols).eq("visit_id", visit.id);
    if (upTo) q = q.lte("server_time", upTo);
    return q.order("happened_at");
  };

  const [company, branch, su, clocks, tasks, notes, concerns, assigned, doses, meds] = await Promise.all([
    db.from("companies").select("name").eq("id", visit.company_id).maybeSingle<{ name: string }>(),
    db.from("branches").select("name").eq("id", visit.branch_id).maybeSingle<{ name: string }>(),
    db.from("service_users").select("full_name, ssid").eq("id", visit.service_user_id).maybeSingle<{ full_name: string; ssid: string | null }>(),
    rows("rota_clock_events", "person_id, kind, happened_at, method, location, distance_m, accuracy_m, reason_code, reason_text, flags, added_reason"),
    rows("rota_task_outcomes", "person_id, task_name, is_key, outcome, reason_code, reason_text, happened_at, flags"),
    rows("rota_care_notes", "id, person_id, author_name, body, happened_at, for_next_carer, corrects_note_id, flags"),
    rows("rota_concerns", "person_id, author_name, category, body, happened_at, status"),
    db.from("rota_visit_assignments").select("person_id, status, people(full_name)").eq("visit_id", visit.id),
    rows("rota_mar_doses", "person_id, author_name, med_uid, outcome, reason_code, reason_text, quantity, happened_at, flags, rota_mar_medicines(name, prn, dose_unit)"),
    // The regular medicines live now, to say which were due and not recorded.
    db.from("rota_mar_medicines").select("med_uid, name, prn, slots, days, start_date, stop_date, dose_quantity").eq("service_user_id", visit.service_user_id).eq("status", "live").eq("prn", false),
  ]);

  type Clock = { person_id: string; kind: "in" | "out"; happened_at: string; method: string; location: string; distance_m: number | null; accuracy_m: number | null; reason_code: string | null; reason_text: string | null; flags: string[] | null; added_reason: string | null };
  type Task = { person_id: string; task_name: string; is_key: boolean; outcome: "done" | "refused" | "not_needed"; reason_code: string | null; reason_text: string | null; happened_at: string; flags: string[] | null };
  type Note = { id: string; person_id: string; author_name: string; body: string; happened_at: string; for_next_carer: boolean; corrects_note_id: string | null; flags: string[] | null };
  type Concern = { person_id: string; author_name: string; category: string; body: string; happened_at: string; status: string };
  type Assign = { person_id: string; status: string; people: { full_name: string } | { full_name: string }[] | null };

  const clockRows = (clocks.data ?? []) as unknown as Clock[];
  const taskRows = (tasks.data ?? []) as unknown as Task[];
  const noteRows = (notes.data ?? []) as unknown as Note[];
  const concernRows = (concerns.data ?? []) as unknown as Concern[];
  type Dose = {
    person_id: string; author_name: string; med_uid: string; outcome: "given" | "refused" | "not_available" | "other"; reason_code: string | null;
    reason_text: string | null; quantity: number | string | null; happened_at: string; flags: string[] | null;
    rota_mar_medicines: { name: string; prn: boolean; dose_unit: string | null } | { name: string; prn: boolean; dose_unit: string | null }[] | null;
  };
  type Med = { med_uid: string; name: string; prn: boolean; slots: string[]; days: number[] | null; start_date: string; stop_date: string | null; dose_quantity: number | null };
  const doseRows = (doses.data ?? []) as unknown as Dose[];
  const slot = (visit.generated_key ?? "").split(":")[3] ?? "";
  const notRecorded = ((meds.data ?? []) as unknown as Med[])
    .filter((m) => dueAt(m, visit.visit_date, slot) && !doseRows.some((d) => d.med_uid === m.med_uid))
    .map((m) => m.name);
  // The carers: whoever recorded anything, plus whoever is on the visit now.
  const names = new Map<string, string>();
  for (const a of (assigned.data ?? []) as unknown as Assign[]) {
    const p = Array.isArray(a.people) ? a.people[0] : a.people;
    if (a.status === "active" || clockRows.some((c) => c.person_id === a.person_id)) names.set(a.person_id, p?.full_name ?? "Carer");
  }
  for (const n of noteRows) if (!names.has(n.person_id)) names.set(n.person_id, n.author_name);
  for (const c of concernRows) if (!names.has(c.person_id)) names.set(c.person_id, c.author_name);
  for (const d of doseRows) if (!names.has(d.person_id)) names.set(d.person_id, d.author_name);

  const input: VisitRecordInput = {
    companyName: company.data?.name ?? "",
    branchName: branch.data?.name ?? "",
    serviceUserName: su.data?.full_name ?? "Service user",
    ssid: su.data?.ssid ?? null,
    visitDate: visit.visit_date,
    startTime: visit.start_time.slice(0, 5),
    endTime: visit.end_time.slice(0, 5),
    service: visit.service,
    version: opts.version?.version ?? 0,
    madeAt: upTo ?? new Date().toISOString(),
    carers: [...names.entries()].map(([personId, name]) => ({ personId, name })),
    clocks: clockRows.map((c) => ({
      personId: c.person_id, kind: c.kind, at: c.happened_at, method: c.method, location: c.location, distance_m: c.distance_m,
      accuracy_m: c.accuracy_m, reason_code: c.reason_code, reason_text: c.reason_text, flags: c.flags ?? [], added_reason: c.added_reason,
    })),
    tasks: taskRows.map((t) => ({
      personId: t.person_id, name: t.task_name, isKey: t.is_key, outcome: t.outcome, reason_code: t.reason_code, reason_text: t.reason_text,
      at: t.happened_at, flags: t.flags ?? [],
    })),
    notes: noteRows.map((n) => ({
      id: n.id, personId: n.person_id, author: n.author_name, body: n.body, at: n.happened_at, forNextCarer: n.for_next_carer,
      correctsNoteId: n.corrects_note_id, flags: n.flags ?? [],
    })),
    concerns: concernRows.map((c) => ({ personId: c.person_id, author: c.author_name, category: c.category, body: c.body, at: c.happened_at, status: c.status })),
    doses: doseRows.map((d) => {
      const m = Array.isArray(d.rota_mar_medicines) ? d.rota_mar_medicines[0] : d.rota_mar_medicines;
      return {
        personId: d.person_id, name: m?.name ?? "Medicine", prn: m?.prn ?? false, outcome: d.outcome, reason_code: d.reason_code, reason_text: d.reason_text,
        quantity: d.quantity == null ? null : Number(d.quantity), unit: m?.dose_unit ?? null, at: d.happened_at, flags: d.flags ?? [],
      };
    }),
    notRecorded,
  };
  return { input, serviceUserId: visit.service_user_id, companyId: visit.company_id };
}

export async function renderVisitRecordPdf(input: VisitRecordInput): Promise<Buffer> {
  return renderReportPdf(buildVisitRecord(input) as ReportDoc);
}
