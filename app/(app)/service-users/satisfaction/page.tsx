import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import SatisfactionRegisterTable from "@/components/service-users/satisfaction-register-table";
import { getSatisfaction, SATISFACTION_QUESTIONS } from "@/lib/service-users/satisfaction";

export const metadata: Metadata = { title: "Satisfaction" };

const ALLOWED = ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : "—";
}

export default async function SatisfactionPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (!ALLOWED.includes(profile.role)) redirect("/service-users");

  const sat = await getSatisfaction(profile.company_id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackLink href="/service-users" label="Back to Service Users" />
      <div>
        <h1 className="page-title">Satisfaction</h1>
        <p className="page-subtitle">
          Service user feedback from personal plan reviews, and the customer satisfaction percentage for the PQS.
        </p>
      </div>

      <p className="text-xs text-white/45">
        Period {fmtDate(sat.window.from)} to {fmtDate(sat.window.to)}. Scored from the Feedback, Call Times and Outcomes
        section of each Individual Plan Review completed in this period.
      </p>

      <SatisfactionRegisterTable rows={sat.rows} questions={SATISFACTION_QUESTIONS} />
    </div>
  );
}
