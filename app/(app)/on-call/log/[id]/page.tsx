import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import BackLink from "@/components/back-link";
import LogForm from "@/components/on-call/log-form";
import { getLog, getOnCallBranches, getCompanyPeopleOptions } from "@/lib/on-call/data";
import { listServiceUsersLite } from "@/lib/complaints/data";
import { fmtDateTime, toLocalInput } from "@/lib/on-call/format";

export const metadata: Metadata = { title: "On-call call" };

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

  const [branches, people, serviceUsers] = await Promise.all([
    getOnCallBranches(companyId, profile.role, user.id),
    getCompanyPeopleOptions(companyId),
    listServiceUsersLite(companyId),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink href="/on-call/log" label="Back to call log" />
      <div>
        <h1 className="text-xl font-bold text-white">Call #{log.ref_number}</h1>
        <p className="text-sm text-white/60">
          {fmtDateTime(log.occurred_at)} · {log.branch_name}
          {log.handler_person_name ? ` · handled by ${log.handler_person_name}` : ""}
        </p>
      </div>
      <LogForm
        branches={branches}
        people={people}
        serviceUsers={serviceUsers}
        currentUserId={user.id}
        nowLocal={toLocalInput(new Date().toISOString())}
        log={log}
      />
    </div>
  );
}
