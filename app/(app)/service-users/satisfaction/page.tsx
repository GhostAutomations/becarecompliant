import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Satisfaction" };

const ALLOWED = ["platform_admin", "company_admin", "manager"];

export default async function SatisfactionPage() {
  const { profile } = await requireCompany();
  if (!ALLOWED.includes(profile.role)) redirect("/service-users");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <BackLink href="/service-users" label="Back to Service Users" />
      <div>
        <h1 className="page-title">Satisfaction</h1>
        <p className="page-subtitle">
          Service user feedback and the customer satisfaction percentage for the PQS.
        </p>
      </div>
      <div className="glass-card p-6 text-sm text-white/60">
        This section is coming in a later phase. It will gather service user feedback and feed the
        PQS customer satisfaction question.
      </div>
    </div>
  );
}
