import type { Metadata } from "next";
import Link from "next/link";
import { requireCompany } from "@/lib/auth/guards";
import { NavIcon } from "@/components/nav-icon";
import RegisterMatrix from "@/components/people/register-matrix";
import RealtimeRefresh from "@/components/realtime-refresh";
import ViewNav from "@/components/people/view-nav";
import { listBranches, listRegister, getColumnLabels, type RegisterScope } from "@/lib/people/data";

export const metadata: Metadata = { title: "People" };

const MANAGE_ROLES = ["company_admin", "manager", "platform_admin"];

// View key (URL ?view=) -> register scope + heading. Absent = Main (active).
const VIEWS: Record<string, { scope: RegisterScope; title: string }> = {
  leavers: { scope: "leaver", title: "Leavers" },
  lts_mat: { scope: "lts_mat", title: "LTS & Mat Leave" },
  archive: { scope: "archived", title: "Archive" },
};

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; view?: string }>;
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
  const { branch, view } = await searchParams;
  const branchId = branch || null;
  const activeView = view && VIEWS[view] ? view : "main";
  const scope: RegisterScope = view && VIEWS[view] ? VIEWS[view].scope : "active";
  const heading = view && VIEWS[view] ? VIEWS[view].title : "People";

  const [branches, register, columnLabels] = await Promise.all([
    listBranches(companyId),
    listRegister(companyId, branchId, scope),
    getColumnLabels(companyId),
  ]);
  const { definitions, rows } = register;
  const canManage = MANAGE_ROLES.includes(profile.role);

  const defByKey = Object.fromEntries(definitions.map((d) => [d.key, d]));
  const matrixConfig = {
    supInterval: defByKey["supervision"]?.interval ?? 90,
    supAmber: defByKey["supervision"]?.amber_days ?? 30,
    rtwAmber: defByKey["right_to_work"]?.amber_days ?? 30,
    probationAmber: defByKey["probation_review"]?.amber_days ?? 14,
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <RealtimeRefresh />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{heading}</h1>
        </div>
        {canManage && activeView === "main" ? (
          <Link href="/people/new" className="btn-primary">
            Add person
          </Link>
        ) : null}
      </div>

      <ViewNav current={activeView} branchId={branchId} branches={branches} />

      <div className="min-h-0 flex-1">
        {rows.length === 0 ? (
          <div className="glass-card flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-400/10 text-gold-400">
              <NavIcon icon="people" className="h-6 w-6" />
            </span>
            {activeView === "main" ? (
              <>
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
              </>
            ) : (
              <h2 className="text-base font-semibold text-white">No {heading.toLowerCase()} to show</h2>
            )}
          </div>
        ) : (
          <RegisterMatrix rows={rows} config={matrixConfig} editable={canManage} columnLabels={columnLabels} />
        )}
      </div>
    </div>
  );
}
