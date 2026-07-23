import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import BackLink from "@/components/back-link";
import LogForm from "@/components/on-call/log-form";
import { getOnCallBranches, getRotaScope, getLogDraft } from "@/lib/on-call/data";
import { shiftOptions } from "@/lib/on-call/format";

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
  const [scope, branches, draft] = await Promise.all([
    getRotaScope(companyId),
    getOnCallBranches(companyId, profile.role, user.id),
    getLogDraft(user.id),
  ]);

  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/London" }).format(new Date()));
  const defaultShift = `${hour < 12 ? "am" : "pm"}|${todayIso}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink href="/on-call/log" label="Back to call log" />
      <h1 className="text-xl font-bold text-white">Log a call</h1>
      <LogForm
        scope={scope}
        branches={branches}
        shiftChoices={shiftOptions(todayIso)}
        defaultShift={defaultShift}
        draft={draft}
      />
    </div>
  );
}
