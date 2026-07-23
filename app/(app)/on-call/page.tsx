import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import RealtimeRefresh from "@/components/realtime-refresh";
import RotaView from "@/components/on-call/rota-view";
import {
  getRota,
  getCurrentOnCall,
  getOnCallBranches,
  getCompanyPeopleOptions,
  getOpenFollowUpCount,
} from "@/lib/on-call/data";

export const metadata: Metadata = { title: "On Call" };

const ONCALL_ROLES = [
  "company_admin", "registered_individual", "registered_manager",
  "manager", "supervisor", "on_call", "platform_admin",
];

export default async function OnCallPage() {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/dashboard");
  if (!(await featureEnabled(profile.company_id, "on_call"))) redirect("/dashboard");
  if (!ONCALL_ROLES.includes(profile.role)) redirect("/dashboard");

  const companyId = profile.company_id;
  const [current, upcoming, branches, people, openFollowUps] = await Promise.all([
    getCurrentOnCall(companyId),
    getRota(companyId),
    getOnCallBranches(companyId, profile.role, user.id),
    getCompanyPeopleOptions(companyId),
    getOpenFollowUpCount(companyId),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <RealtimeRefresh tables={["on_call_shifts", "on_call_logs"]} channel="on-call-live" />
      <RotaView
        current={current}
        upcoming={upcoming}
        branches={branches}
        people={people}
        openFollowUps={openFollowUps}
        canManage
      />
    </div>
  );
}
