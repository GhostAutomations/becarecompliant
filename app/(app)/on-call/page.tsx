import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { getOnCallLabel } from "@/lib/on-call/company-label";
import { featureEnabled } from "@/lib/billing/tier";
import RealtimeRefresh from "@/components/realtime-refresh";
import RotaGrid from "@/components/on-call/rota-grid";
import { rotaWeekGrid } from "@/lib/on-call/format";
import {
  getRotaScope,
  getRotaGrid,
  getOnCallBranches,
  getCompanyPeopleOptions,
} from "@/lib/on-call/data";

/* The tab title follows the company's name for the department (0276), so it cannot be a
   static export any more. */
export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await requireCompany();
  return { title: await getOnCallLabel(profile.company_id) };
}

const ONCALL_ROLES = [
  "company_admin", "registered_individual", "registered_manager",
  "manager", "supervisor", "on_call", "platform_admin",
];
const SCOPE_ADMIN_ROLES = ["company_admin", "registered_individual", "registered_manager", "platform_admin"];
/*
 * Who may ROSTER, as opposed to read. A Manager or Supervisor runs a branch, so on a branch rota
 * they roster their own; on a company-wide rota there is no branch to be theirs, and rostering
 * the company's out of hours cover belongs to the people who own it (Phil, 2026-08-17). They can
 * still see it, which is the point of the screen: 0203 grants the read and withholds the write,
 * and this is the screen agreeing with the database rather than offering a + that gets refused.
 */
const ROSTER_ROLES = ["company_admin", "registered_individual", "registered_manager", "on_call", "platform_admin"];

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
  const weeks = rotaWeekGrid(todayIso);
  const first = weeks[0].days[0];
  /* The LAST week, not the third. This read weeks[2] while the grid drew as many weeks as the
     grid function returned, so adding a fourth week would have drawn it empty for ever: the
     assignments were fetched for three weeks and the fourth had nothing to show. */
  const last = weeks[weeks.length - 1].days[6];

  /*
   * On a branch rota, rostering needs a branch to roster INTO. A Manager whose only branch is a
   * team, or a branch since archived, gets an empty picker, selectedBranchId null, and a grid
   * that drew a + in all forty two cells and saved none of them: assignCell returns silently
   * with no branch. That is the same defect as the company-wide one, one branch away.
   */
  const canManage =
    scope === "branch" ? selectedBranchId !== null : ROSTER_ROLES.includes(profile.role);

  const [cells, people] = await Promise.all([
    getRotaGrid(companyId, scope, selectedBranchId, first, last),
    getCompanyPeopleOptions(companyId),
  ]);

  return (
    <div className="page-shell">
      <RealtimeRefresh tables={["on_call_shifts", "on_call_logs"]} channel="on-call-live" />
      <RotaGrid
        scope={scope}
        canChangeScope={SCOPE_ADMIN_ROLES.includes(profile.role)}
        canManage={canManage}
        branches={branches}
        selectedBranchId={selectedBranchId}
        weeks={weeks}
        cells={Object.fromEntries(cells)}
        people={people}
        todayIso={todayIso}
        currentSlot={currentSlot}
      />
    </div>
  );
}
