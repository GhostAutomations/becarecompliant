import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import OutcomesManager from "@/components/service-users/outcomes-manager";
import { getServiceUser, getServiceUserOutcomes, getOutcomesReviewMonths } from "@/lib/service-users/data";
import { isOutcomeAchievingOrProgressing } from "@/lib/service-users/outcome-consts";

export const metadata: Metadata = { title: "Personal outcomes" };

const MANAGE_ROLES = ["company_admin", "registered_individual", "registered_manager", "manager", "platform_admin"];

export default async function ServiceUserOutcomesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const { profile } = await requireCompany();
  const su = await getServiceUser(id);
  if (!su || !profile.company_id) redirect("/service-users");
  if (!MANAGE_ROLES.includes(profile.role)) redirect(`/service-users/${id}`);

  // Back goes to wherever you came from: the Outcomes register, or the record's tile.
  const cameFromRegister = from === "/service-users/outcomes";
  const backHref = cameFromRegister ? "/service-users/outcomes" : `/service-users/${id}`;
  const backLabel = cameFromRegister ? "Back to Outcomes" : "Back to record";

  const [outcomes, intervalMonths] = await Promise.all([
    getServiceUserOutcomes(id),
    getOutcomesReviewMonths(profile.company_id),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

  const inScope = outcomes.length;
  const ap = outcomes.filter((o) => isOutcomeAchievingOrProgressing(o.status)).length;
  const pct = inScope > 0 ? Math.round((ap / inScope) * 100) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href={backHref} label={backLabel} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Personal outcomes</h1>
          <p className="page-subtitle">{su.full_name}</p>
        </div>
        {inScope > 0 ? (
          <div className="glass-card px-4 py-2 text-right">
            <p className="text-lg font-bold text-emerald-300">{pct}%</p>
            <p className="text-[11px] text-white/45">{ap} of {inScope} achieving or progressing</p>
          </div>
        ) : null}
      </div>
      <p className="text-sm text-white/55">
        What matters to this person, tracked over time with progress updates. These feed the well-being outcomes in your PQS return.
      </p>

      <OutcomesManager serviceUserId={id} outcomes={outcomes} intervalMonths={intervalMonths} today={today} />
    </div>
  );
}
