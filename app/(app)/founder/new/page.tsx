import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { CreateCompanyForm } from "@/components/founder/create-company-form";
import { getSetupCatalogue } from "@/lib/setup/catalogue";

export const metadata: Metadata = { title: "Create a company" };

export default async function FounderNewCompanyPage() {
  await requirePlatformAdmin();
  const catalogue = await getSetupCatalogue();
  return (
    <div className="w-full space-y-6">
      <div>
        <BackLink href="/founder" label="Back to Founder console" />
        <h1 className="page-title mt-1">Create a company</h1>
        <p className="page-subtitle">
          Seeds one Team (office) and its branches, and Thistle&rsquo;s set up: forms, People and
          Service User checks and the training catalogue. Untick anything this customer
          won&rsquo;t use.
        </p>
      </div>
      <div className="glass-card p-6">
        <CreateCompanyForm catalogue={catalogue} />
      </div>
    </div>
  );
}
