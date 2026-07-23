import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import RealtimeRefresh from "@/components/realtime-refresh";
import RotaGrid from "@/components/on-call/rota-grid";
import { threeWeekGrid } from "@/lib/on-call/format";
import {
  getRotaScope,
  getRotaGrid,
  getOnCallBranches,
  getCompanyPeopleOptions,
  getOpenFollowUpCount,
} from "@/lib/on-call/data";

export const metadata: Metadata = { title: "On Call" };

const ONCALL_ROLES = [
  "company_admin", "registered_individual", "registered_manager",
  "manager", "supervisor", "on_call", "platform_admin",
];
const SCOPE_ADMIN_ROLES = ["company_admin", "registered_individual", "registered_manager", "platform_admin"];

export default async function OnCallPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/dashboard");
  if (!(await featureEnabled(profile.company_id, "on_call"))) redirect("/dashboard");
  if (!ONCALL_ROLES.includes(profile.role)) redirect("/dashboard");

  const companyId = profile.company_id;
  const [scope, branches] = await Promise.all([
    getRotaScope(companyId),
    getOnCallBranches(companyId, profile.role, user.id),
  ]);

  const sp = await searchParams;
  const selectedBranchId =
    scope === "branch"
      ? (sp.branch && branches.some((b) => b.id === sp.branch) ? sp.branch : branches[0]?.id ?? null)
      : null;

  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/London" }).format(new Date()));
  const currentSlot: "am" | "pm" = hour < 12 ? "am" : "pm";
  const weeks = threeWeekGrid(todayIso);
  const first = weeks[0].days[0];
  const last = weeks[2].days[6];

  const [cells, people, openFollowUps] = await Promise.all([
    getRotaGrid(companyId, scope, selectedBranchId, first, last),
    getCompanyPeopleOptions(companyId),
    getOpenFollowUpCount(companyId),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <RealtimeRefresh tables={["on_call_shifts", "on_call_logs"]} channel="on-call-live" />
      <RotaGrid
        scope={scope}
        canChangeScope={SCOPE_ADMIN_ROLES.includes(profile.role)}
        canManage
        branches={branches}
        selectedBranchId={selectedBranchId}
        weeks={weeks}
        cells={Object.fromEntries(cells)}
        people={people}
        todayIso={todayIso}
        currentSlot={currentSlot}
        openFollowUps={openFollowUps}
      />
    </div>
  );
}
