import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import CreatePersonForm from "@/components/people/create-person-form";
import { listBranches, listSupervisoryUsers } from "@/lib/people/data";

export const metadata: Metadata = { title: "Add person" };

const MANAGE_ROLES = ["company_admin", "manager", "platform_admin"];

export default async function NewPersonPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/people");
  if (!MANAGE_ROLES.includes(profile.role)) redirect("/people");

  const [branches, users] = await Promise.all([
    listBranches(profile.company_id),
    listSupervisoryUsers(profile.company_id),
  ]);
  const branchOptions = branches.filter((b) => b.kind === "branch" || b.kind === "team");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/people" className="text-xs text-white/50 hover:text-white/80">
          People
        </Link>
        <h1 className="page-title mt-1">Add a person</h1>
        <p className="page-subtitle">
          Identity and employment only. Their compliance checks are applied and
          scheduled automatically.
        </p>
      </div>

      <div className="glass-card p-6">
        <CreatePersonForm branches={branchOptions} users={users} />
      </div>
    </div>
  );
}
