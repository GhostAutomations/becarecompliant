import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import BackLink from "@/components/back-link";
import LogForm from "@/components/on-call/log-form";
import { getOnCallBranches, getCompanyPeopleOptions, getLogDraft } from "@/lib/on-call/data";
import { listServiceUsersLite } from "@/lib/complaints/data";
import { toLocalInput } from "@/lib/on-call/format";

export const metadata: Metadata = { title: "Log a call" };

const ONCALL_ROLES = [
  "company_admin", "registered_individual", "registered_manager",
  "manager", "supervisor", "on_call", "platform_admin",
];

export default async function NewCallPage() {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/dashboard");
  if (!(await featureEnabled(profile.company_id, "on_call"))) redirect("/dashboard");
  if (!ONCALL_ROLES.includes(profile.role)) redirect("/dashboard");

  const companyId = profile.company_id;
  const [branches, people, serviceUsers, draft] = await Promise.all([
    getOnCallBranches(companyId, profile.role, user.id),
    getCompanyPeopleOptions(companyId),
    listServiceUsersLite(companyId),
    getLogDraft(user.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink href="/on-call/log" label="Back to call log" />
      <h1 className="text-xl font-bold text-white">Log a call</h1>
      <LogForm
        branches={branches}
        people={people}
        serviceUsers={serviceUsers}
        currentUserId={user.id}
        nowLocal={toLocalInput(new Date().toISOString())}
        draft={draft}
      />
    </div>
  );
}
