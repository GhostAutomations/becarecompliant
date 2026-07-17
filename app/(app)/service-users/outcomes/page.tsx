import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Outcomes" };

const ALLOWED = ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"];

export default async function OutcomesPage() {
  const { profile } = await requireCompany();
  if (!ALLOWED.includes(profile.role)) redirect("/service-users");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <BackLink href="/service-users" label="Back to Service Users" />
      <div>
        <h1 className="page-title">Outcomes</h1>
        <p className="page-subtitle">
          Personal outcomes for service users, and the percentage achieved or progressing for the
          PQS.
        </p>
      </div>
      <div className="glass-card p-6 text-sm text-white/60">
        This section is coming in a later phase. It will capture each service user&rsquo;s personal
        outcomes and feed the PQS outcomes questions.
      </div>
    </div>
  );
}
