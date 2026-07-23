import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import BackLink from "@/components/back-link";
import LogForm from "@/components/on-call/log-form";
import LogReadOnLoad from "@/components/on-call/log-read-on-load";
import { getLog, getOnCallBranches, getRotaScope, getLogReads } from "@/lib/on-call/data";
import { shiftOptions, shiftLabel } from "@/lib/on-call/format";

export const metadata: Metadata = { title: "On-call shift" };

const ONCALL_ROLES = [
  "company_admin", "registered_individual", "registered_manager",
  "manager", "supervisor", "on_call", "platform_admin",
];

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/dashboard");
  if (!(await featureEnabled(profile.company_id, "on_call"))) redirect("/dashboard");
  if (!ONCALL_ROLES.includes(profile.role)) redirect("/dashboard");

  const companyId = profile.company_id;
  const log = await getLog(id);
  if (!log || log.company_id !== companyId) redirect("/on-call/log");

  const [scope, branches, reads] = await Promise.all([
    getRotaScope(companyId),
    getOnCallBranches(companyId, profile.role, user.id),
    getLogReads(id),
  ]);
  const fmtRead = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const choices = shiftOptions(todayIso);
  // Make sure this log's shift is always selectable even if it is outside the window.
  const logShift = `${log.slot}|${log.shift_date}`;
  if (log.shift_date && log.slot && !choices.some((c) => c.value === logShift)) {
    choices.unshift({ value: logShift, label: shiftLabel(log.shift_date, log.slot) });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <LogReadOnLoad logId={log.id} />
      <BackLink href="/on-call/log" label="Back to call log" />
      <div>
        <h1 className="text-xl font-bold text-white">Shift: {shiftLabel(log.shift_date, log.slot)}</h1>
        {log.branch_name ? <p className="text-sm text-white/60">{log.branch_name}</p> : null}
      </div>

      {log.finalised ? (
        <div className="glass-card space-y-4 p-5">
          <span className="pill-neutral">Finalised{log.finalised_at ? ` · ${fmtRead(log.finalised_at)}` : ""}</span>
          <div>
            <p className="form-label">On Call Notes</p>
            <p className="whitespace-pre-wrap text-sm text-white/85">{log.details}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="form-label">Number of complaints</p>
              <p className="text-sm text-white/85">{log.complaints_count}{log.complaints_count > 0 ? (log.complaints_logged ? " · logged" : " · not logged") : ""}</p>
            </div>
            <div>
              <p className="form-label">Number of absences</p>
              <p className="text-sm text-white/85">{log.absences_count}{log.absences_count > 0 ? (log.absences_logged ? " · logged" : " · not logged") : ""}</p>
            </div>
          </div>
          <div>
            <p className="form-label">Urgent follow up</p>
            {log.follow_up_required ? (
              <p className="text-sm text-white/85">
                {log.follow_up_notes || "Needed"}{log.follow_up_done ? " · completed" : ""}
              </p>
            ) : (
              <p className="text-sm text-white/50">Not needed</p>
            )}
          </div>
        </div>
      ) : (
        <LogForm
          scope={scope}
          branches={branches}
          shiftChoices={choices}
          defaultShift={logShift}
          log={log}
        />
      )}
      {reads.length > 0 ? (
        <p className="text-xs text-white/40">
          Read by: {reads.map((r) => `${r.name} (${fmtRead(r.read_at)})`).join(", ")}
        </p>
      ) : null}
    </div>
  );
}
