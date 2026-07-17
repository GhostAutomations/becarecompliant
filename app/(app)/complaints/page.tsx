import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import RealtimeRefresh from "@/components/realtime-refresh";
import ComplaintsRegister from "@/components/complaints/complaints-register";
import {
  listComplaints,
  getComplaintsConfig,
  getComplaintRefPrefix,
  listAccessibleBranchTypes,
} from "@/lib/complaints/data";

export const metadata: Metadata = { title: "Complaints" };

const MANAGE_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "platform_admin"];

export default async function ComplaintsPage() {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/dashboard");
  // Complaints hold special-category data: Managers + Admins only.
  if (!MANAGE_ROLES.includes(profile.role)) redirect("/dashboard");

  const companyId = profile.company_id;
  const [rows, branches, config, refPrefix] = await Promise.all([
    listComplaints(companyId),
    listAccessibleBranchTypes(companyId, profile.role, user.id),
    getComplaintsConfig(companyId),
    getComplaintRefPrefix(companyId),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <RealtimeRefresh tables={["complaints"]} channel="complaints-live" />
      <ComplaintsRegister
        rows={rows}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        amberDays={config.amber_days}
        refPrefix={refPrefix}
        canManage
      />
    </div>
  );
}
