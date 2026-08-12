import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import CreateDisclosureForm from "@/components/whistleblowing/create-disclosure-form";
import { listCompanyBranches } from "@/lib/whistleblowing/data";
import { todayIso } from "@/lib/whistleblowing/logic";

export const metadata: Metadata = { title: "Record a disclosure" };

const MANAGE_ROLES = ["company_admin", "registered_individual", "platform_admin"];

export default async function NewDisclosurePage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/whistleblowing");
  if (!MANAGE_ROLES.includes(profile.role)) redirect("/dashboard");

  const branches = await listCompanyBranches(profile.company_id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <BackLink href="/whistleblowing" label="Back to Whistleblowing" />
        <h1 className="page-title mt-1">Record a disclosure</h1>
        <p className="page-subtitle">
          Record it as it was made. Anonymous unless the person gave their name, and their
          name is only ever stored if you say they did.
        </p>
      </div>

      <div className="glass-card p-6">
        <CreateDisclosureForm branches={branches} todayIso={todayIso()} />
      </div>
    </div>
  );
}
