import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { getRegisterNameSort } from "@/lib/register/name-sort-pref";
import ServiceUserRegister from "@/components/service-users/service-user-register";
import RealtimeRefresh from "@/components/realtime-refresh";
import {
  listRegister,
  getServiceUserColumnLabels,
  listAccessibleBranchTypes,
  getReviewIntervalDays,
} from "@/lib/service-users/data";
import { listRegisterCheckColumns, getRegisterColumnText } from "@/lib/register/data";
import { REGISTER_ROLES as MANAGE_ROLES } from "@/lib/auth/module-roles";

export const metadata: Metadata = { title: "Service Users" };


export default async function ServiceUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; view?: string }>;
}) {
  const { user, profile } = await requireCompany();
  // A Team Member (staff) login has one destination: their own area.
  if (profile.role === "staff") redirect("/my");
  if (profile.role === "on_call") redirect("/on-call");

  if (!profile.company_id) {
    return (
      <div className="page-shell">
        <h1 className="page-title">Service Users</h1>
        <div className="glass-card mt-6 p-6 text-sm text-white/60">
          Open a company from the Founder console and choose Manage as company to
          view its Service User register.
        </div>
      </div>
    );
  }

  const companyId = profile.company_id;
  const { branch, view } = await searchParams;

  // Load EVERY Service User once (all statuses, all the viewer's branches). Branches
  // and View are then switched instantly on the client with no server round trip.
  const nameSort = await getRegisterNameSort(user.id);
  const [branches, register, columnLabels, reviewIntervalDays, checkColumns] = await Promise.all([
    listAccessibleBranchTypes(companyId, profile.role, user.id),
    listRegister(companyId, null, "all"),
    getServiceUserColumnLabels(companyId),
    getReviewIntervalDays(companyId),
    listRegisterCheckColumns(companyId, "service_users"),
  ]);

  /*
   * Cell text for any column pointed at a question on its form. Read AFTER the register, because
   * it needs the evidence ids the register already resolved: no extra query per person.
   */
  const columnText = await getRegisterColumnText(
    checkColumns,
    register.rows
      .flatMap((row) =>
        Object.values(row.statusByKey).map((s) => ({
          evidenceId: s.last_evidence_id ?? "",
          definitionId: s.definition_id,
        })),
      )
      .filter((r) => r.evidenceId),
  );

  const canManage = MANAGE_ROLES.includes(profile.role);
  const isAdmin = profile.role === "company_admin" || profile.role === "platform_admin";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RealtimeRefresh
        tables={["service_users", "check_instances", "service_user_trackers"]}
        channel="service-users-live"
      />
      <ServiceUserRegister
        rows={register.rows}
        branches={branches}
        columnLabels={columnLabels}
        checkColumns={checkColumns}
        columnText={columnText}
        reviewIntervalDays={reviewIntervalDays}
        canManage={canManage}
        isAdmin={isAdmin}
        initialView={view ?? "main"}
        initialBranch={branch ?? ""}
        initialSort={nameSort}
      />
    </div>
  );
}
