import type { Metadata } from "next";
import { requireRotaOffice } from "@/lib/rota/access";

/* The title is only given once the guard passes: a fixed title would name the module in the
   browser tab even on the Not Found page of a company that does not have it. */
export async function generateMetadata(): Promise<Metadata> {
  await requireRotaOffice();
  return { title: "Rota" };
}

/**
 * Be Care Compliant: the Rota department (Rota and Visits beta, Stage 0, Phil 2026-10-15).
 *
 * Empty for now: Stage 0 builds only the Founder switch and this section, so the company that
 * has the module on can see where it will live. Not Found for every company without the
 * module, and for every role outside the office roles (lib/rota/access.ts).
 */
export default async function RotaPage() {
  await requireRotaOffice();

  return (
    <div className="page-shell space-y-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title">Rota</h1>
          <span className="pill pill-amber">Beta</span>
        </div>
        <p className="text-sm text-white/60">Shifts, visits and runs for your branches.</p>
      </div>

      <section aria-label="Beta notice" className="glass-card border-amber-500/40 p-4">
        <h2 className="text-sm font-semibold text-amber-300">Beta: test data only</h2>
        <p className="mt-1 text-sm text-white/70">
          Rota and Visits is being built and tested on test data. Do not use it for real staff or
          service users yet. Before any real service user is recorded here, the clinical safety
          review and the Welsh record keeping research must be complete.
        </p>
      </section>

      <section aria-label="Rota" className="glass-card p-6 text-center">
        <p className="text-base font-medium text-white/85">Nothing on the rota yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-white/55">
          Shift planning arrives here next, followed by visits and runs, clocking in and out,
          care plans, care notes and the MAR.
        </p>
      </section>
    </div>
  );
}
