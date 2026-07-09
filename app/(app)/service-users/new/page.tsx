import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import CreateServiceUserForm from "@/components/service-users/create-service-user-form";
import { listBranches } from "@/lib/service-users/data";

export const metadata: Metadata = { title: "Add service user" };

const MANAGE_ROLES = ["company_admin", "manager", "platform_admin"];

export default async function NewServiceUserPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/service-users");
  if (!MANAGE_ROLES.includes(profile.role)) redirect("/service-users");

  const branches = await listBranches(profile.company_id);
  const branchOptions = branches.filter((b) => b.kind === "branch" || b.kind === "team");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <BackLink href="/service-users" label="Back to Service Users" />
        <h1 className="page-title mt-1">Add a service user</h1>
        <p className="page-subtitle">
          Identity only. Their care plan review, risk assessment, medication audit and
          consent review are applied and scheduled automatically.
        </p>
      </div>

      <div className="glass-card p-6">
        <CreateServiceUserForm branches={branchOptions} />
      </div>
    </div>
  );
}
