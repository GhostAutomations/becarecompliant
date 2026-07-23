import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { featureEnabled } from "@/lib/billing/tier";
import BackLink from "@/components/back-link";
import RotaArchive from "@/components/on-call/rota-archive";
import { threeWeekGrid } from "@/lib/on-call/format";
import { getRotaScope, getOnCallBranches, getArchiveRota } from "@/lib/on-call/data";

export const metadata: Metadata = { title: "On Call · Archived rota" };

const ONCALL_ROLES = [
  "company_admin", "registered_individual", "registered_manager",
  "manager", "supervisor", "on_call", "platform_admin",
];

export default async function ArchivedRotaPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) redirect("/dashboard");
  if (!(await featureEnabled(profile.company_id, "on_call"))) redirect("/dashboard");
  if (!ONCALL_ROLES.includes(profile.role)) redirect("/dashboard");

  const companyId = profile.company_id;
  const [scope, branches] = await Promise.all([
    getRotaScope(companyId),
    getOnCallBranches(companyId, profile.role, user.id),
  ]);

  const sp = await searchParams;
  const selectedBranchId =
    scope === "branch"
      ? (sp.branch && branches.some((b) => b.id === sp.branch) ? sp.branch : branches[0]?.id ?? null)
      : null;

  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const currentMonday = threeWeekGrid(todayIso)[0].days[0];
  const weeks = await getArchiveRota(companyId, scope, selectedBranchId, currentMonday);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <BackLink href="/on-call" label="Back to Rota" />
      <h1 className="text-xl font-bold text-white">Archived rota</h1>
      <RotaArchive scope={scope} branches={branches} selectedBranchId={selectedBranchId} weeks={weeks} />
    </div>
  );
}
