import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import { listCallLog } from "@/lib/on-call/data";
import { relationshipLabel } from "@/lib/on-call/types";
import { fmtDateTime } from "@/lib/on-call/format";
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

/** The on-call call log as CSV, for inspectors / local authority monitoring. */
export async function GET() {
  const { profile } = await requireCompany();
  if (!profile.company_id) return exportError("No company context.", 400);
  if (!(await featureEnabled(profile.company_id, "on_call"))) return exportError("On Call is not enabled for this company.", 403);
  if (!ONCALL_ROLES.includes(profile.role)) return exportError("Not permitted.", 403);

  const rows = await listCallLog(profile.company_id);
  const header = [
    "Ref", "When", "Branch", "Category", "Caller", "Caller type", "Service user",
    "Details", "Action taken", "Outcome", "Handled by",
    "Follow up required", "Follow up done", "Follow up notes",
  ];
  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    lines.push([
      `#${r.ref_number}`,
      fmtDateTime(r.occurred_at),
      r.branch_name,
      r.category,
      r.caller_name,
      r.caller_relationship ? relationshipLabel(r.caller_relationship) : "",
      r.service_user_name,
      r.details,
      r.action_taken,
      r.outcome,
      r.handler_person_name,
      r.follow_up_required ? "Yes" : "No",
      r.follow_up_required ? (r.follow_up_done ? "Yes" : "No") : "",
      r.follow_up_notes,
    ].map(cell).join(","));
  }

  await writeAudit({
    companyId: profile.company_id, actorId: profile.id, actorEmail: profile.email, actorRole: profile.role,
    action: "report.exported", entityType: "report", entityId: null,
    summary: "Exported the on-call call log (CSV)", metadata: { report: "on_call_log" },
  });

  return csvResponse(lines.join("\n"), "on-call-log");
}
