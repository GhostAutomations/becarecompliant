import "server-only";

/**
 * Be Care Compliant — building a subject access export (Phil, 2026-09-24). See lib/sar/layout.ts
 * for what goes in it and why.
 *
 * ONE MODEL, TWO OUTPUTS. Every section is gathered once as a table (title, headers, rows) and
 * printed twice from that: as a table in summary.pdf and as its own CSV. The PDF and the CSV
 * cannot disagree about what is held.
 *
 * READ WITH THE SERVICE ROLE, AFTER THE CALLER HAS BEEN CHECKED. The route only lets a Company
 * Admin of the record's own company in (the company is the controller and answers the request),
 * and a SAR must be complete: a policy written for day to day screens must not quietly leave a
 * section out. Every section is read by the record's own id and company.
 *
 * WHAT IS STILL HELD IS WHAT IS DISCLOSED. An update an Admin removed, or one its author edited,
 * still has its earlier words kept for Admins (record_update_edits). Those are data held about
 * the subject, so they are in the export, marked as such.
 */

import { zipSync, strToU8 } from "fflate";
import { createServiceClient } from "@/lib/supabase/admin";
import { EVIDENCE_BUCKET } from "@/lib/evidence/storage";
import { getEvidencePackData, renderEvidencePackPdf, evidencePackCsv } from "@/lib/export/evidence-pack";
import { renderReportPdf, type ReportBlock } from "@/lib/export/pdf";
import { buildCsv, type CsvCell } from "@/lib/export/csv";
import { fmtDate, fmtDateTime, generatedAt } from "@/lib/export/format";
import { readmeText, safeFileName, uniquePath, type SarKind } from "./layout";

type Section = { title: string; file: string; headers: string[]; rows: CsvCell[][]; empty: string };
type Attachment = { bucket: string; path: string; folder: string; name: string };

export type SarResult = {
  zip: Uint8Array;
  recordName: string;
  companyId: string;
  fileCount: number;
  missing: string[];
};

const yes = (b: boolean | null | undefined) => (b == null ? "" : b ? "Yes" : "No");
const t = (v: unknown) => (v == null ? "" : String(v));

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export async function buildSubjectAccessExport(input: {
  kind: SarKind;
  recordId: string;
  companyId: string;
  actorName: string;
}): Promise<{ ok: true; result: SarResult } | { ok: false; error: string }> {
  const db = createServiceClient();
  const { kind, recordId, companyId } = input;
  const recordCol = kind === "person" ? "person_id" : "service_user_id";

  // ---- The record itself, which must belong to the caller's company.
  const recordRes =
    kind === "person"
      ? await db
          .from("people")
          .select("id, company_id, full_name, job_title, team, employment_status, start_date, leaver_date, work_email, mobile, scw_registration_number, archived_at, created_at, branches(name)")
          .eq("id", recordId)
          .maybeSingle()
      : await db
          .from("service_users")
          .select("id, company_id, full_name, ssid, package_start_date, service_status, discharge_date, address, phone, archived_at, care_plan_path, care_plan_uploaded_at, private_invoicing, invoice_to, invoice_contact_name, invoice_address, invoice_phone, invoice_email, created_at, branches(name)")
          .eq("id", recordId)
          .maybeSingle();
  const rec = recordRes.data as Record<string, unknown> | null;
  if (!rec || rec.company_id !== companyId) return { ok: false, error: "That record could not be found." };
  const recordName = String(rec.full_name ?? "");
  const branchName = (one(rec.branches as { name: string } | { name: string }[] | null)?.name) ?? "";
  const { data: company } = await db.from("companies").select("name").eq("id", companyId).maybeSingle();
  const companyName = (company as { name?: string } | null)?.name ?? "";

  const sections: Section[] = [];
  const attachments: Attachment[] = [];

  // ---- Record
  const recordPairs: Array<[string, unknown]> =
    kind === "person"
      ? [
          ["Name", rec.full_name], ["Branch", branchName], ["Job title", rec.job_title], ["Team", rec.team],
          ["Working status", rec.employment_status], ["Start date", fmtDate(rec.start_date as string)],
          ["Leaving date", fmtDate(rec.leaver_date as string)], ["Work email", rec.work_email], ["Mobile", rec.mobile],
          ["Social Care Wales registration", rec.scw_registration_number], ["Archived", fmtDate(rec.archived_at as string)],
          ["Record created", fmtDateTime(rec.created_at as string)],
        ]
      : [
          ["Name", rec.full_name], ["Branch", branchName], ["SSID", rec.ssid], ["Package start", fmtDate(rec.package_start_date as string)],
          ["Status", rec.service_status], ["Discharge date", fmtDate(rec.discharge_date as string)], ["Address", rec.address],
          ["Phone", rec.phone], ["Archived", fmtDate(rec.archived_at as string)],
          ["Private invoicing", yes(rec.private_invoicing as boolean)], ["Invoice to", rec.invoice_to],
          ["Invoice contact", rec.invoice_contact_name], ["Invoice address", rec.invoice_address],
          ["Invoice phone", rec.invoice_phone], ["Invoice email", rec.invoice_email],
          ["Care plan uploaded", fmtDateTime(rec.care_plan_uploaded_at as string)],
          ["Record created", fmtDateTime(rec.created_at as string)],
        ];
  if (kind === "person") {
    const { data: tr } = await db.from("person_trackers").select("*").eq("person_id", recordId).maybeSingle();
    const x = (tr ?? {}) as Record<string, unknown>;
    recordPairs.push(
      ["DBS date", fmtDate(x.dbs_date as string)], ["Enhanced DBS date", fmtDate(x.enhanced_dbs_date as string)],
      ["Right to Work expiry", fmtDate(x.rtw_expiry_date as string)], ["Right to Work limits", x.rtw_limits],
      ["Probation end due", fmtDate(x.probation_end_due as string)], ["Probation ended", fmtDate(x.probation_end_actual as string)],
      ["Probation status", x.probation_status], ["Probation extended to", fmtDate(x.probation_extension_date as string)],
    );
  } else {
    const { data: tr } = await db.from("service_user_trackers").select("*").eq("service_user_id", recordId).maybeSingle();
    const x = (tr ?? {}) as Record<string, unknown>;
    recordPairs.push(["Planned review", fmtDate(x.planned_review_date as string)]);
  }
  sections.push({
    title: "Record",
    file: "record.csv",
    headers: ["Field", "Value"],
    rows: recordPairs.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => [k, t(v)]),
    empty: "",
  });

  // ---- Checks
  const { data: checks } = await db
    .from("check_instances")
    .select("due_date, last_completed_on, expiry_date, active, check_definitions(name)")
    .eq(recordCol, recordId)
    .order("due_date", { ascending: true });
  sections.push({
    title: "Checks",
    file: "checks.csv",
    headers: ["Check", "Next due", "Last completed", "Expiry", "Active"],
    rows: ((checks ?? []) as Array<Record<string, unknown>>).map((c) => [
      one(c.check_definitions as { name: string } | null)?.name ?? "",
      fmtDate(c.due_date as string), fmtDate(c.last_completed_on as string), fmtDate(c.expiry_date as string), yes(c.active as boolean),
    ]),
    empty: "No checks on this record.",
  });

  // ---- Updates, with any earlier wording still held
  const { data: updates } = await db
    .from("record_updates")
    .select("id, parent_id, author_name, body, created_at, edited_at, pinned_at, removed_at, removed_reason, record_update_files(storage_path, file_name, created_at), record_update_edits(kind, previous_body, changed_at)")
    .eq(recordCol, recordId)
    .order("created_at", { ascending: true });
  const updateRows: CsvCell[][] = [];
  for (const u of (updates ?? []) as Array<Record<string, unknown>>) {
    const files = (u.record_update_files as Array<{ storage_path: string; file_name: string }> | null) ?? [];
    updateRows.push([
      fmtDateTime(u.created_at as string), t(u.author_name), u.parent_id ? "Reply" : "Update",
      u.removed_at ? `Removed ${fmtDateTime(u.removed_at as string)}: ${t(u.removed_reason)}` : u.edited_at ? `Edited ${fmtDateTime(u.edited_at as string)}` : "",
      t(u.body), files.map((f) => f.file_name).join("; "),
    ]);
    for (const e of ((u.record_update_edits as Array<{ kind: string; previous_body: string; changed_at: string }> | null) ?? [])) {
      updateRows.push([
        fmtDateTime(e.changed_at), "", "Earlier wording",
        e.kind === "removed" ? "Wording before the update was removed" : "Wording before an edit", e.previous_body, "",
      ]);
    }
    for (const f of files) attachments.push({ bucket: "record-updates", path: f.storage_path, folder: "files/updates", name: f.file_name });
  }
  sections.push({
    title: "Updates",
    file: "updates.csv",
    headers: ["When", "Written by", "Type", "Changes", "Words", "Files"],
    rows: updateRows,
    empty: "No updates on this record.",
  });

  if (kind === "person") {
    // ---- Training
    const { data: training } = await db
      .from("person_training")
      .select("status, completed_on, expiry_on, booked_for, certificate_path, training_courses(name)")
      .eq("person_id", recordId);
    const trainingRows: CsvCell[][] = [];
    for (const r of (training ?? []) as Array<Record<string, unknown>>) {
      const course = one(r.training_courses as { name: string } | null)?.name ?? "";
      trainingRows.push([course, t(r.status), fmtDate(r.completed_on as string), fmtDate(r.expiry_on as string), fmtDate(r.booked_for as string), r.certificate_path ? "Yes" : "No"]);
      if (r.certificate_path) {
        const p = String(r.certificate_path);
        attachments.push({ bucket: EVIDENCE_BUCKET, path: p, folder: "files/training", name: `${course}_${p.split("/").pop() ?? "certificate"}` });
      }
    }
    sections.push({ title: "Training", file: "training.csv", headers: ["Course", "Status", "Completed", "Expires", "Booked for", "Certificate"], rows: trainingRows, empty: "No training recorded." });

    // ---- Holiday
    const { data: hol } = await db
      .from("holiday_requests")
      .select("start_date, end_date, hours, status, note, requester_name, created_at, decided_at, decision_note, cancelled_at, cancel_reason")
      .eq("person_id", recordId)
      .order("start_date", { ascending: true });
    sections.push({
      title: "Holiday",
      file: "holiday.csv",
      headers: ["From", "To", "Hours", "Status", "Note", "Requested by", "Requested", "Decided", "Decision note", "Cancelled", "Cancel reason"],
      rows: ((hol ?? []) as Array<Record<string, unknown>>).map((h) => [
        fmtDate(h.start_date as string), fmtDate(h.end_date as string), t(h.hours), t(h.status), t(h.note), t(h.requester_name),
        fmtDateTime(h.created_at as string), fmtDateTime(h.decided_at as string), t(h.decision_note), fmtDateTime(h.cancelled_at as string), t(h.cancel_reason),
      ]),
      empty: "No holiday requests.",
    });

    // ---- Absence and meetings
    const { data: abs } = await db
      .from("absence_events")
      .select("start_date, end_date, return_date, days, reason, rtw_due_date, created_at")
      .eq("person_id", recordId)
      .order("start_date", { ascending: true });
    sections.push({
      title: "Absence",
      file: "absence.csv",
      headers: ["From", "To", "Returned", "Days", "Reason", "Return to work due", "Recorded"],
      rows: ((abs ?? []) as Array<Record<string, unknown>>).map((a) => [
        fmtDate(a.start_date as string), fmtDate(a.end_date as string), fmtDate(a.return_date as string), t(a.days), t(a.reason),
        fmtDate(a.rtw_due_date as string), fmtDateTime(a.created_at as string),
      ]),
      empty: "No absences recorded.",
    });
    const { data: meet } = await db
      .from("absence_meetings")
      .select("stage, meeting_date, meeting_time, duration_minutes, location, response, response_reason, responded_at")
      .eq("person_id", recordId)
      .order("meeting_date", { ascending: true });
    sections.push({
      title: "Absence meetings",
      file: "absence-meetings.csv",
      headers: ["Stage", "Date", "Time", "Minutes", "Location", "Their response", "Reason given", "Responded"],
      rows: ((meet ?? []) as Array<Record<string, unknown>>).map((m) => [
        t(m.stage), fmtDate(m.meeting_date as string), t(m.meeting_time), t(m.duration_minutes), t(m.location), t(m.response),
        t(m.response_reason), fmtDateTime(m.responded_at as string),
      ]),
      empty: "No absence meetings.",
    });

    // ---- Leaving
    const { data: leave } = await db
      .from("person_leavings")
      .select("leaving_date, reason, reason_other, re_employ, competitor, competitor_name, score_attitude, score_attendance, score_lateness, score_professionalism, score_privacy, score_teamwork, recorded_at, applied_at, cancelled_at, rejoined_at")
      .eq("person_id", recordId)
      .order("recorded_at", { ascending: true });
    sections.push({
      title: "Leaving",
      file: "leaving.csv",
      headers: ["Leaving date", "Reason", "Other reason", "Would re-employ", "Moving to a competitor", "Competitor", "Attitude", "Attendance", "Lateness", "Professionalism", "Privacy", "Teamwork", "Recorded", "Took effect", "Called off", "Rejoined"],
      rows: ((leave ?? []) as Array<Record<string, unknown>>).map((l) => [
        fmtDate(l.leaving_date as string), t(l.reason), t(l.reason_other), yes(l.re_employ as boolean), t(l.competitor), t(l.competitor_name),
        t(l.score_attitude), t(l.score_attendance), t(l.score_lateness), t(l.score_professionalism), t(l.score_privacy), t(l.score_teamwork),
        fmtDateTime(l.recorded_at as string), fmtDateTime(l.applied_at as string), fmtDateTime(l.cancelled_at as string), fmtDateTime(l.rejoined_at as string),
      ]),
      empty: "No leaving recorded.",
    });
  } else {
    // ---- Care plan file and care schedule
    if (rec.care_plan_path) {
      const p = String(rec.care_plan_path);
      attachments.push({ bucket: EVIDENCE_BUCKET, path: p, folder: "files/care-plan", name: p.split("/").pop() ?? "care-plan.pdf" });
    }
    const { data: sched } = await db
      .from("care_plan_entries")
      .select("day_of_week, slot, service, unit, quantity, carers, handed, effective_from, effective_to, position")
      .eq("service_user_id", recordId)
      .order("day_of_week", { ascending: true })
      .order("position", { ascending: true });
    const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    sections.push({
      title: "Care schedule",
      file: "care-schedule.csv",
      headers: ["Day", "Call", "Service", "Quantity", "Unit", "Carers", "Handed", "From", "Until"],
      rows: ((sched ?? []) as Array<Record<string, unknown>>).map((s) => [
        DAYS[Number(s.day_of_week)] ?? t(s.day_of_week), t(s.slot), t(s.service), t(s.quantity), t(s.unit), t(s.carers), t(s.handed),
        fmtDate(s.effective_from as string), fmtDate(s.effective_to as string),
      ]),
      empty: "No care schedule.",
    });

    // ---- Outcomes, notes and reviews
    const { data: outs } = await db
      .from("service_user_outcomes")
      .select("id, title, statement, detail, status, target_date, achieved_at, last_reviewed, review_note, archived_at, created_at")
      .eq("service_user_id", recordId)
      .order("position", { ascending: true });
    const outcomeName = new Map<string, string>();
    sections.push({
      title: "Outcomes",
      file: "outcomes.csv",
      headers: ["Outcome", "Statement", "Detail", "Status", "Target", "Achieved", "Last reviewed", "Review note", "Archived", "Added"],
      rows: ((outs ?? []) as Array<Record<string, unknown>>).map((o) => {
        outcomeName.set(String(o.id), t(o.title) || t(o.statement));
        return [
          t(o.title), t(o.statement), t(o.detail), t(o.status), fmtDate(o.target_date as string), fmtDateTime(o.achieved_at as string),
          fmtDate(o.last_reviewed as string), t(o.review_note), fmtDateTime(o.archived_at as string), fmtDateTime(o.created_at as string),
        ];
      }),
      empty: "No personal outcomes.",
    });
    const { data: notes } = await db
      .from("service_user_outcome_updates")
      .select("outcome_id, kind, progress, note, author_name, created_at")
      .eq("service_user_id", recordId)
      .order("created_at", { ascending: true });
    sections.push({
      title: "Outcome notes",
      file: "outcome-notes.csv",
      headers: ["When", "Outcome", "Type", "Progress", "Note", "Written by"],
      rows: ((notes ?? []) as Array<Record<string, unknown>>).map((n) => [
        fmtDateTime(n.created_at as string), outcomeName.get(String(n.outcome_id)) ?? "", t(n.kind), t(n.progress), t(n.note), t(n.author_name),
      ]),
      empty: "No outcome notes.",
    });
    const { data: reviews } = await db
      .from("outcomes_reviews")
      .select("reviewed_at, reviewer_name, note")
      .eq("service_user_id", recordId)
      .order("reviewed_at", { ascending: true });
    sections.push({
      title: "Outcome reviews",
      file: "outcome-reviews.csv",
      headers: ["Reviewed", "Reviewer", "Note"],
      rows: ((reviews ?? []) as Array<Record<string, unknown>>).map((r) => [fmtDate(r.reviewed_at as string), t(r.reviewer_name), t(r.note)]),
      empty: "No outcome reviews.",
    });
  }

  // ---- Evidence: the full forms (the inspection pack renderer) and every original file.
  const pack = await getEvidencePackData(kind, recordId);
  const { data: evRows } = await db
    .from("evidence")
    .select("id")
    .eq("company_id", companyId)
    .eq("record_type", kind)
    .eq("record_id", recordId)
    .is("anonymised_at", null);
  const evIds = ((evRows ?? []) as Array<{ id: string }>).map((e) => e.id);
  if (evIds.length > 0) {
    const { data: evFiles } = await db
      .from("evidence_files")
      .select("evidence_id, storage_path, file_name")
      .in("evidence_id", evIds)
      .is("purged_at", null)
      .not("storage_path", "is", null);
    for (const f of (evFiles ?? []) as Array<{ evidence_id: string; storage_path: string; file_name: string | null }>) {
      attachments.push({
        bucket: EVIDENCE_BUCKET,
        path: f.storage_path,
        folder: "files/evidence",
        name: `${f.evidence_id.slice(0, 8)}_${f.file_name ?? f.storage_path.split("/").pop() ?? "file"}`,
      });
    }
  }

  // ---- Assemble
  const entries: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  const put = (path: string, bytes: Uint8Array) => {
    used.add(path.toLowerCase());
    entries[path] = bytes;
  };

  const blocks: ReportBlock[] = [];
  for (const s of sections) {
    blocks.push({ kind: "heading", text: s.title });
    if (s.title === "Record") {
      blocks.push({ kind: "keyvalues", pairs: s.rows.map((r) => ({ label: String(r[0]), value: String(r[1] ?? "") })) });
    } else {
      blocks.push({
        kind: "table",
        columns: s.headers.map((h) => ({ header: h })),
        rows: s.rows.map((r) => r.map((c) => ({ text: c == null ? "" : String(c) }))),
        emptyText: s.empty,
      });
    }
    put(s.file, strToU8(buildCsv(s.headers, s.rows)));
  }
  blocks.push({ kind: "heading", text: "Evidence" });
  blocks.push({
    kind: "paragraph",
    text: pack.ok
      ? `${pack.data.evidence.length} completed ${pack.data.evidence.length === 1 ? "form is" : "forms are"} in evidence.pdf, each in full, with an index in evidence.csv. Original uploads are in files/evidence.`
      : "The evidence could not be read.",
  });

  const made = generatedAt();
  const summary = await renderReportPdf({
    title: `Subject access export: ${recordName}`,
    subtitle: kind === "person" ? "Person" : "Service User",
    meta: [
      { label: "Company", value: companyName },
      { label: "Branch", value: branchName },
      { label: "Made", value: made },
      { label: "Made by", value: input.actorName },
    ],
    blocks,
    footerNote: "Read before sending: remove or redact other people's details. See README.txt.",
    landscape: true,
  });
  put("summary.pdf", new Uint8Array(summary));

  if (pack.ok) {
    put("evidence.pdf", new Uint8Array(await renderEvidencePackPdf(pack.data)));
    put("evidence.csv", strToU8(evidencePackCsv(pack.data)));
  }

  const missing: string[] = [];
  for (const a of attachments) {
    const { data: blob, error } = await db.storage.from(a.bucket).download(a.path);
    if (error || !blob) {
      missing.push(`${a.folder}/${safeFileName(a.name)}`);
      continue;
    }
    put(uniquePath(used, a.folder, a.name), new Uint8Array(await blob.arrayBuffer()));
  }

  const listed = Object.keys(entries).sort();
  const readme = readmeText({ kind, recordName, companyName, generatedAt: made, generatedBy: input.actorName, files: listed });
  const readmeWithGaps = missing.length
    ? `${readme}\r\nFILES THAT COULD NOT BE READ (${missing.length})\r\n${missing.join("\r\n")}\r\n`
    : readme;
  entries["README.txt"] = strToU8(readmeWithGaps);

  const zip = zipSync(entries, { level: 6 });
  return { ok: true, result: { zip, recordName, companyId, fileCount: Object.keys(entries).length, missing } };
}
