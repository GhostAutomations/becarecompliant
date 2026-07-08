import type { Metadata } from "next";
import { requireCompany } from "@/lib/auth/guards";
import { NavIcon } from "@/components/nav-icon";

export const metadata: Metadata = { title: "Service Users" };

export default async function ServiceUsersPage() {
  await requireCompany();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="page-title">Service Users</h1>
        <p className="page-subtitle">
          The register for the people receiving care: one Record per service
          user, with their checks and RAG status.
        </p>
      </div>

      <div className="glass-card flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-400/10 text-gold-400">
          <NavIcon icon="serviceUsers" className="h-6 w-6" />
        </span>
        <h2 className="text-base font-semibold text-white">
          No Service User records yet
        </h2>
        <p className="max-w-md text-sm text-white/60">
          The Service User register arrives in Phase 4: care plan reviews, risk
          assessments, medication audits and consent reviews, with access fully
          audit logged.
        </p>
      </div>
    </div>
  );
}
