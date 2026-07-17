import type { Metadata } from "next";
import { requireCompany } from "@/lib/auth/guards";
import PeopleRegister from "@/components/people/people-register";
import RealtimeRefresh from "@/components/realtime-refresh";
import { listBranches, listRegister, getColumnLabels } from "@/lib/people/data";
import { listRegisterCheckColumns } from "@/lib/register/data";

export const metadata: Metadata = { title: "People" };

const MANAGE_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "platform_admin"];

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
          Open a company from the Founder console and choose Manage as company to
          view its People register.
        </div>
      </div>
    );
  }

  const companyId = profile.company_id;
  const { branch, view } = await searchParams;

  // Load EVERY person once (all statuses, all the viewer's branches). Branches and
  // View are then switched instantly on the client with no server round trip.
  const [branches, register, columnLabels, checkColumns] = await Promise.all([
    listBranches(companyId),
    listRegister(companyId, null, "all"),
    getColumnLabels(companyId),
    listRegisterCheckColumns(companyId, "people"),
  ]);
  const { definitions, rows } = register;
  const canManage = MANAGE_ROLES.includes(profile.role);
  const isAdmin = profile.role === "company_admin" || profile.role === "platform_admin";

  const defByKey = Object.fromEntries(definitions.map((d) => [d.key, d]));
  const matrixConfig = {
    supInterval: defByKey["supervision"]?.interval ?? 90,
    supAmber: defByKey["supervision"]?.amber_days ?? 30,
    rtwAmber: defByKey["right_to_work"]?.amber_days ?? 30,
    probationAmber: defByKey["probation_review"]?.amber_days ?? 14,
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RealtimeRefresh />
      <PeopleRegister
        rows={rows}
        branches={branches}
        config={matrixConfig}
        columnLabels={columnLabels}
        checkColumns={checkColumns}
        canManage={canManage}
        isAdmin={isAdmin}
        initialView={view ?? "main"}
        initialBranch={branch ?? ""}
      />
    </div>
  );
}
