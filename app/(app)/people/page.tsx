import type { Metadata } from "next";
import Link from "next/link";
import { requireCompany } from "@/lib/auth/guards";
import { NavIcon } from "@/components/nav-icon";
import RegisterMatrix from "@/components/people/register-matrix";
import RealtimeRefresh from "@/components/realtime-refresh";
import { listBranches, listRegister } from "@/lib/people/data";

export const metadata: Metadata = { title: "People" };

const MANAGE_ROLES = ["company_admin", "manager", "platform_admin"];

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { profile } = await requireCompany();

  if (!profile.company_id) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="page-title">People</h1>
        <div className="glass-card mt-6 p-6 text-sm text-white/60">
          Select a company to view its People register. Manage as company arrives
          with the Founder console.
        </div>
      </div>
    );
  }

  const companyId = profile.company_id;
  const { branch } = await searchParams;
  const branchId = branch || null;

  const [branches, register] = await Promise.all([
    listBranches(companyId),
    listRegister(companyId, branchId),
  ]);
  const { definitions, rows } = register;
  const canManage = MANAGE_ROLES.includes(profile.role);

  // Record-level rollup counts (are we inspection ready, at a glance).
  const counts = rows.reduce(
    (acc, r) => {
      const rag = r.rollup?.rag ?? "none";
      if (rag === "red") acc.overdue += 1;
      else if (rag === "amber") acc.dueSoon += 1;
      else if (rag === "green") acc.compliant += 1;
      return acc;
    },
    { compliant: 0, dueSoon: 0, overdue: 0 },
  );

  const branchOptions = branches.filter((b) => b.kind === "branch" || b.kind === "team");

  return (
    <div className="space-y-6">
      <RealtimeRefresh />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">People</h1>
          <p className="page-subtitle">
            The staff team register: one Record per person, with their checks and
            RAG status.
          </p>
        </div>
        {canManage ? (
          <div className="flex items-center gap-2">
            <Link href="/people/checks" className="btn-outline">
              Configure checks
            </Link>
            <Link href="/people/new" className="btn-primary">
              Add person
            </Link>
          </div>
        ) : null}
      </div>

      {/* RAG summary strip */}
      <section aria-label="Compliance status" className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card p-5">
          <span className="pill-green"><span className="pill-dot" /> Compliant</span>
          <p className="mt-3 text-3xl font-bold text-white">{counts.compliant}</p>
          <p className="text-xs text-white/50">Records with everything in date</p>
        </div>
        <div className="glass-card p-5">
          <span className="pill-amber"><span className="pill-dot" /> Due soon</span>
          <p className="mt-3 text-3xl font-bold text-white">{counts.dueSoon}</p>
          <p className="text-xs text-white/50">Records with a check due soon</p>
        </div>
        <div className="glass-card p-5">
          <span className="pill-red"><span className="pill-dot" /> Overdue</span>
          <p className="mt-3 text-3xl font-bold text-white">{counts.overdue}</p>
          <p className="text-xs text-white/50">Records with an overdue check</p>
        </div>
      </section>

      {/* Branch filter */}
      {branchOptions.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/people"
            className={!branchId ? "pill-neutral" : "dock-link px-3 py-1.5 text-xs"}
          >
            All branches
          </Link>
          {branchOptions.map((b) => (
            <Link
              key={b.id}
              href={`/people?branch=${b.id}`}
              className={branchId === b.id ? "pill-neutral" : "dock-link px-3 py-1.5 text-xs"}
            >
              {b.name}
            </Link>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-400/10 text-gold-400">
            <NavIcon icon="people" className="h-6 w-6" />
          </span>
          <h2 className="text-base font-semibold text-white">No People records yet</h2>
          <p className="max-w-md text-sm text-white/60">
            Add your first staff member and their supervision, appraisal, DBS,
            right to work and training checks are scheduled automatically.
          </p>
          {canManage ? (
            <Link href="/people/new" className="btn-primary mt-2">
              Add your first person
            </Link>
          ) : null}
        </div>
      ) : (
        <RegisterMatrix rows={rows} definitions={definitions} />
      )}
    </div>
  );
}
