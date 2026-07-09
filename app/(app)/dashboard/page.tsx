import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { NavIcon } from "@/components/nav-icon";
import RealtimeRefresh from "@/components/realtime-refresh";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { profile } = await requireProfile();
  const firstName = (profile.full_name || profile.email).split(" ")[0];

  // Company-wide People + Service User rollups (RLS scopes each to what this role
  // may see). Both active-only views exclude leavers / cancelled / archived Records.
  const counts = { compliant: 0, dueSoon: 0, overdue: 0 };
  const suCounts = { compliant: 0, dueSoon: 0, overdue: 0 };
  if (profile.company_id) {
    const supabase = await createClient();
    const [{ data: rollups }, { data: suRollups }] = await Promise.all([
      supabase.from("person_rollup").select("rag").eq("company_id", profile.company_id),
      supabase.from("service_user_rollup").select("rag").eq("company_id", profile.company_id),
    ]);
    for (const r of (rollups as Array<{ rag: string }> | null) ?? []) {
      if (r.rag === "red") counts.overdue += 1;
      else if (r.rag === "amber") counts.dueSoon += 1;
      else if (r.rag === "green") counts.compliant += 1;
    }
    for (const r of (suRollups as Array<{ rag: string }> | null) ?? []) {
      if (r.rag === "red") suCounts.overdue += 1;
      else if (r.rag === "amber") suCounts.dueSoon += 1;
      else if (r.rag === "green") suCounts.compliant += 1;
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <RealtimeRefresh />
      <RealtimeRefresh
        tables={["service_users", "check_instances", "service_user_trackers"]}
        channel="service-users-live"
      />
      <div>
        <h1 className="page-title">Welcome, {firstName}</h1>
        <p className="page-subtitle">
          Your compliance overview. One glance: are we inspection ready across your
          team and the people you care for?
        </p>
      </div>

      {/* People RAG rollup strip (zero state until checks exist) */}
      <section aria-label="People compliance status" className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">People</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="glass-card p-5">
            <span className="pill-green"><span className="pill-dot" /> Compliant</span>
            <p className="mt-3 text-3xl font-bold text-white">{counts.compliant}</p>
            <p className="text-xs text-white/50">People with everything in date</p>
          </div>
          <div className="glass-card p-5">
            <span className="pill-amber"><span className="pill-dot" /> Due soon</span>
            <p className="mt-3 text-3xl font-bold text-white">{counts.dueSoon}</p>
            <p className="text-xs text-white/50">People with a check due soon</p>
          </div>
          <div className="glass-card p-5">
            <span className="pill-red"><span className="pill-dot" /> Overdue</span>
            <p className="mt-3 text-3xl font-bold text-white">{counts.overdue}</p>
            <p className="text-xs text-white/50">People with an overdue check</p>
          </div>
        </div>
      </section>

      {/* Service User RAG rollup strip (cancelled + archived excluded) */}
      <section aria-label="Service User compliance status" className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Service Users</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="glass-card p-5">
            <span className="pill-green"><span className="pill-dot" /> Compliant</span>
            <p className="mt-3 text-3xl font-bold text-white">{suCounts.compliant}</p>
            <p className="text-xs text-white/50">Service users with everything in date</p>
          </div>
          <div className="glass-card p-5">
            <span className="pill-amber"><span className="pill-dot" /> Due soon</span>
            <p className="mt-3 text-3xl font-bold text-white">{suCounts.dueSoon}</p>
            <p className="text-xs text-white/50">Service users with a check due soon</p>
          </div>
          <div className="glass-card p-5">
            <span className="pill-red"><span className="pill-dot" /> Overdue</span>
            <p className="mt-3 text-3xl font-bold text-white">{suCounts.overdue}</p>
            <p className="text-xs text-white/50">Service users with an overdue check</p>
          </div>
        </div>
      </section>

      {/* App grid */}
      <section aria-label="Sections" className="grid gap-4 sm:grid-cols-2">
        <Link href="/people" className="app-tile">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-400/10 text-gold-400">
            <NavIcon icon="people" className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold text-white">People</h2>
          <p className="text-sm text-white/60">
            Your staff team register: supervisions, appraisals, DBS renewals,
            training refreshers.
          </p>
          <span className="pill-green mt-auto w-fit"><span className="pill-dot" /> Live</span>
        </Link>

        <Link href="/service-users" className="app-tile">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-400/10 text-gold-400">
            <NavIcon icon="serviceUsers" className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold text-white">
            Service Users
          </h2>
          <p className="text-sm text-white/60">
            Your clients receiving care: care plan reviews, risk assessments,
            medication audits.
          </p>
          <span className="pill-green mt-auto w-fit"><span className="pill-dot" /> Live</span>
        </Link>
      </section>
    </div>
  );
}
