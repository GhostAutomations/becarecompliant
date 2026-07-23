import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import ServiceUserRegister from "@/components/service-users/service-user-register";
import RealtimeRefresh from "@/components/realtime-refresh";
import {
  listRegister,
  listSupervisoryUsers,
  getServiceUserColumnLabels,
  listAccessibleBranchTypes,
  getComplexReviewInterval,
} from "@/lib/service-users/data";
import { listRegisterCheckColumns } from "@/lib/register/data";

export const metadata: Metadata = { title: "Service Users" };

const MANAGE_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "platform_admin"];

export default async function ServiceUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; view?: string }>;
}) {
  const { user, profile } = await requireCompany();
  if (profile.role === "on_call") redirect("/on-call");

  if (!profile.company_id) {
    return (
      <div className="mx-auto max-w-3xl">
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
  const [branches, register, reviewers, columnLabels, complexIntervalDays, checkColumns] = await Promise.all([
    listAccessibleBranchTypes(companyId, profile.role, user.id),
    listRegister(companyId, null, "all"),
    listSupervisoryUsers(companyId),
    getServiceUserColumnLabels(companyId),
    getComplexReviewInterval(companyId),
    listRegisterCheckColumns(companyId, "service_users"),
  ]);
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
        reviewers={reviewers}
        columnLabels={columnLabels}
        checkColumns={checkColumns}
        complexIntervalDays={complexIntervalDays}
        canManage={canManage}
        isAdmin={isAdmin}
        initialView={view ?? "main"}
        initialBranch={branch ?? ""}
      />
    </div>
  );
}
