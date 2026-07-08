import type { Metadata } from "next";
import { requireCompany } from "@/lib/auth/guards";
import { NavIcon } from "@/components/nav-icon";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage() {
  await requireCompany();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="page-title">People</h1>
        <p className="page-subtitle">
          The staff team register: one Record per person, with their checks and
          RAG status.
        </p>
      </div>

      <div className="glass-card flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-400/10 text-gold-400">
          <NavIcon icon="people" className="h-6 w-6" />
        </span>
        <h2 className="text-base font-semibold text-white">
          No People records yet
        </h2>
        <p className="max-w-md text-sm text-white/60">
          The People register arrives in Phase 3: records, supervisions,
          appraisals, DBS renewals and the full compliance loop with RAG
          rollups.
        </p>
      </div>
    </div>
  );
}
