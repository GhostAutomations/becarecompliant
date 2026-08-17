import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { listCallLog } from "@/lib/on-call/data";
import { fmtDateTime, shiftLabel } from "@/lib/on-call/format";
import { csvResponse, exportError } from "@/lib/export/deliver";
import { writeAudit } from "@/lib/audit";

const ONCALL_ROLES = [
  "company_admin", "registered_individual", "registered_manager",
  "manager", "supervisor", "on_call", "platform_admin",
];

function cell(v: string | number | boolean | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The on call Register as CSV, for inspectors and local authority monitoring.
 *
 * IT NOW EXPORTS WHAT THE REGISTER ACTUALLY HOLDS. Six of its fourteen columns — Category,
 * Caller, Caller type, Service user, Action taken and Outcome — are hard nulled on every write
 * by commonLogFields, so the file handed to an inspector described a Form that no longer exists
 * and printed six empty columns to prove it. Worse, it left out the things the Register does
 * record: which shift, how many complaints and absences came out of it, and whether it has been
 * finalised. The columns are the fields, and every one of them has something in it.
 */
export async function GET() {
  const { profile } = await requireCompany();
  if (!profile.company_id) return exportError("No company context.", 400);
  if (!(await featureEnabled(profile.company_id, "on_call"))) return exportError("On Call is not enabled for this company.", 403);
  if (!ONCALL_ROLES.includes(profile.role)) return exportError("Not permitted.", 403);

  const rows = await listCallLog(profile.company_id);
  const header = [
    "Ref", "Shift", "Logged at", "Branch", "Handled by", "Details",
    "Complaints", "Complaints logged", "Absences", "Absences logged",
    "Follow up required", "Follow up done", "Follow up notes", "Follow up action",
    "Finalised", "Finalised at",
  ];
  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    lines.push([
      `#${r.ref_number}`,
      shiftLabel(r.shift_date, r.slot),
      fmtDateTime(r.occurred_at),
      // A company that keeps ONE out of hours list writes no branch, and an empty cell there is
      // the truth rather than a gap.
      r.branch_name ?? "Company wide",
      r.handler_person_name,
      r.details,
      r.complaints_count,
      r.complaints_logged ? "Yes" : "No",
      r.absences_count,
      r.absences_logged ? "Yes" : "No",
      r.follow_up_required ? "Yes" : "No",
      r.follow_up_required ? (r.follow_up_done ? "Yes" : "No") : "",
      r.follow_up_notes,
      r.follow_up_action,
      r.finalised ? "Yes" : "No",
      r.finalised_at ? fmtDateTime(r.finalised_at) : "",
    ].map(cell).join(","));
  }

  await writeAudit({
    companyId: profile.company_id, actorId: profile.id, actorEmail: profile.email, actorRole: profile.role,
    action: "report.exported", entityType: "report", entityId: null,
    summary: "Exported the on-call call log (CSV)", metadata: { report: "on_call_log" },
  });

  return csvResponse(lines.join("\n"), "on-call-log");
}
