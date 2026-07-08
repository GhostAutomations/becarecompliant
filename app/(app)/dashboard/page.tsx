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

  // Company-wide People rollup (RLS scopes it to what this role may see).
  const counts = { compliant: 0, dueSoon: 0, overdue: 0 };
  if (profile.company_id) {
    const supabase = await createClient();
    const { data: rollups } = await supabase
      .from("person_rollup")
      .select("rag")
      .eq("company_id", profile.company_id);
    for (const r of (rollups as Array<{ rag: string }> | null) ?? []) {
      if (r.rag === "red") counts.overdue += 1;
      else if (r.rag === "amber") counts.dueSoon += 1;
      else if (r.rag === "green") counts.compliant += 1;
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <RealtimeRefresh />
      <div>
        <h1 className="page-title">Welcome, {firstName}</h1>
        <p className="page-subtitle">
          Your compliance overview will live here. One glance: are we
          inspection ready?
        </p>
      </div>

      {/* RAG rollup strip (zero state until checks exist) */}
      <section aria-label="Compliance status" className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card p-5">
          <span className="pill-green">
            <span className="pill-dot" /> Compliant
          </span>
          <p className="mt-3 text-3xl font-bold text-white">{counts.compliant}</p>
          <p className="text-xs text-white/50">People with everything in date</p>
        </div>
        <div className="glass-card p-5">
          <span className="pill-amber">
            <span className="pill-dot" /> Due soon
          </span>
          <p className="mt-3 text-3xl font-bold text-white">{counts.dueSoon}</p>
          <p className="text-xs text-white/50">People with a check due soon</p>
        </div>
        <div className="glass-card p-5">
          <span className="pill-red">
            <span className="pill-dot" /> Overdue
          </span>
          <p className="mt-3 text-3xl font-bold text-white">{counts.overdue}</p>
          <p className="text-xs text-white/50">People with an overdue check</p>
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
          <span className="pill-neutral mt-auto w-fit">Arrives in Phase 4</span>
        </Link>
      </section>
    </div>
  );
}
