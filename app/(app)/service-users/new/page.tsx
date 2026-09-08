import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import CreateServiceUserForm from "@/components/service-users/create-service-user-form";
import { listAccessibleBranchTypes } from "@/lib/service-users/data";

export const metadata: Metadata = { title: "Add service user" };

const MANAGE_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "platform_admin"];

export default async function NewServiceUserPage() {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/service-users");
  if (!MANAGE_ROLES.includes(profile.role)) redirect("/service-users");

  // Only the branches this user is assigned to (Admins see all); never the office.
  const branchOptions = await listAccessibleBranchTypes(profile.company_id, profile.role, user.id);

  return (
    <div className="page-form space-y-6">
      <div>
        <BackLink href="/service-users" label="Back to Service Users" />
        <h1 className="page-title mt-1">Add a service user</h1>
        <p className="page-subtitle">
          Identity only. Their Setup Visit and Care Plan Review are applied and
          scheduled automatically.
        </p>
      </div>

      <div className="glass-card p-6">
        <CreateServiceUserForm branches={branchOptions} />
      </div>
    </div>
  );
}
