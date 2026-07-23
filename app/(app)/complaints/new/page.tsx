import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import BackLink from "@/components/back-link";
import CreateComplaintForm from "@/components/complaints/create-complaint-form";
import { listAccessibleBranchTypes, listServiceUsersLite } from "@/lib/complaints/data";
import { todayIso } from "@/lib/complaints/logic";

export const metadata: Metadata = { title: "Log a complaint" };

const MANAGE_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "on_call", "platform_admin"];

export default async function NewComplaintPage() {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/complaints");
  if (!(await featureEnabled(profile.company_id, "complaints"))) redirect("/dashboard");
  if (!MANAGE_ROLES.includes(profile.role)) redirect("/complaints");

  const [branches, serviceUsers] = await Promise.all([
    listAccessibleBranchTypes(profile.company_id, profile.role, user.id),
    listServiceUsersLite(profile.company_id),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <BackLink href="/complaints" label="Back to Complaints" />
        <h1 className="page-title mt-1">Log a complaint</h1>
        <p className="page-subtitle">
          Record the complaint and who raised it. The acknowledgement and response
          deadlines are set automatically and can be adjusted on the record.
        </p>
      </div>

      <div className="glass-card p-6">
        <CreateComplaintForm
          branches={branches.map((b) => ({ id: b.id, name: b.name }))}
          serviceUsers={serviceUsers}
          todayIso={todayIso()}
        />
      </div>
    </div>
  );
}
