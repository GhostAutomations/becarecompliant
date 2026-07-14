import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { CreateCompanyForm } from "@/components/founder/create-company-form";

export const metadata: Metadata = { title: "Create a company" };

export default async function FounderNewCompanyPage() {
  await requirePlatformAdmin();
  return (
    <div className="w-full space-y-6">
      <div>
        <BackLink href="/founder" label="Back to Founder console" />
        <h1 className="page-title mt-1">Create a company</h1>
        <p className="page-subtitle">
          Seeds one Team (office) and one Branch, the starter forms, People and
          Service User checks and the training catalogue. Additional branches are
          a paid add on, added later.
        </p>
      </div>
      <div className="glass-card p-6">
        <CreateCompanyForm />
      </div>
    </div>
  );
}
