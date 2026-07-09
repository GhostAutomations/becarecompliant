import type { Metadata } from "next";
import { requireCompany } from "@/lib/auth/guards";
import RealtimeRefresh from "@/components/realtime-refresh";
import SuViewNav from "@/components/service-users/su-view-nav";
import { listBranches, getServiceUserRollupCounts } from "@/lib/service-users/data";

export const metadata: Metadata = { title: "Service User Summary" };

export default async function ServiceUserSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { profile } = await requireCompany();
  if (!profile.company_id) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="page-title">Service User Summary</h1>
        <div className="glass-card mt-6 p-6 text-sm text-white/60">
          Select a company to view its compliance summary.
        </div>
      </div>
    );
  }

  const companyId = profile.company_id;
  const { branch } = await searchParams;
  const branchId = branch || null;

  const [branches, counts] = await Promise.all([
    listBranches(companyId),
    getServiceUserRollupCounts(companyId, branchId),
  ]);

  return (
    <div className="space-y-6">
      <RealtimeRefresh
        tables={["service_users", "check_instances", "service_user_trackers"]}
        channel="service-users-live"
      />
      <div>
        <h1 className="page-title">Service User Summary</h1>
      </div>

      <SuViewNav current="summary" branchId={branchId} branches={branches} />

      <section aria-label="Compliance status" className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card p-5">
          <span className="pill-green"><span className="pill-dot" /> Compliant</span>
          <p className="mt-3 text-3xl font-bold text-white">{counts.compliant}</p>
          <p className="text-xs text-white/50">Service users with everything in date</p>
        </div>
        <div className="glass-card p-5">
          <span className="pill-amber"><span className="pill-dot" /> Due soon</span>
          <p className="mt-3 text-3xl font-bold text-white">{counts.dueSoon}</p>
          <p className="text-xs text-white/50">Service users with a check due soon</p>
        </div>
        <div className="glass-card p-5">
          <span className="pill-red"><span className="pill-dot" /> Overdue</span>
          <p className="mt-3 text-3xl font-bold text-white">{counts.overdue}</p>
          <p className="text-xs text-white/50">Service users with an overdue check</p>
        </div>
      </section>

      <p className="text-xs text-white/40">{counts.total} active service users.</p>
    </div>
  );
}
