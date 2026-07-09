import type { Metadata } from "next";
import { requireCompany } from "@/lib/auth/guards";
import ServiceUserRegister from "@/components/service-users/service-user-register";
import RealtimeRefresh from "@/components/realtime-refresh";
import {
  listBranches,
  listRegister,
  listSupervisoryUsers,
  getServiceUserColumnLabels,
} from "@/lib/service-users/data";

export const metadata: Metadata = { title: "Service Users" };

const MANAGE_ROLES = ["company_admin", "manager", "platform_admin"];

export default async function ServiceUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; view?: string }>;
}) {
  const { profile } = await requireCompany();

  if (!profile.company_id) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="page-title">Service Users</h1>
        <div className="glass-card mt-6 p-6 text-sm text-white/60">
          Select a company to view its Service User register. Manage as company arrives
          with the Founder console.
        </div>
      </div>
    );
  }

  const companyId = profile.company_id;
  const { branch, view } = await searchParams;

  // Load EVERY Service User once (all statuses, all the viewer's branches). Branches
  // and View are then switched instantly on the client with no server round trip.
  const [branches, register, reviewers, columnLabels] = await Promise.all([
    listBranches(companyId),
    listRegister(companyId, null, "all"),
    listSupervisoryUsers(companyId),
    getServiceUserColumnLabels(companyId),
  ]);
  const canManage = MANAGE_ROLES.includes(profile.role);

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
        canManage={canManage}
        initialView={view ?? "main"}
        initialBranch={branch ?? ""}
      />
    </div>
  );
}
