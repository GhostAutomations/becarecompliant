import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import OutcomesRegisterTable from "@/components/service-users/outcomes-register-table";
import { getOutcomesRegister, listAccessibleBranchTypes } from "@/lib/service-users/data";

export const metadata: Metadata = { title: "Outcomes" };

const ALLOWED = ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"];

export default async function OutcomesPage() {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!ALLOWED.includes(profile.role)) redirect("/service-users");
  const [reg, branchTypes] = await Promise.all([
    getOutcomesRegister(profile.company_id),
    listAccessibleBranchTypes(profile.company_id, profile.role, user.id),
  ]);
  const branches = branchTypes.map((b) => ({ id: b.id, name: b.name }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackLink href="/service-users" label="Back to Service Users" />
      <div>
        <h1 className="page-title">Outcomes</h1>
        <p className="page-subtitle">
          Personal outcomes for service users, and the percentage achieving or progressing for the PQS.
        </p>
      </div>

      <OutcomesRegisterTable rows={reg.rows} branches={branches} />
    </div>
  );
}
