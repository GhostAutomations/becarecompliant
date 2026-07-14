import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { NavIcon } from "@/components/nav-icon";
import RealtimeRefresh from "@/components/realtime-refresh";
import { getComplaintCounts } from "@/lib/complaints/data";

export const metadata: Metadata = { title: "Dashboard" };

const COMPLAINTS_ROLES = ["company_admin", "manager", "platform_admin"];

export default async function DashboardPage() {
  // requireCompany so that a founder managing as a company sees that company's
  // dashboard (shadow profile). A real founder with no company has no compliance
  // dashboard of their own: send them to the Founder console, their home.
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  const supabase = await createClient();

  // Greeting: a founder managing-as sees a support-session label with the company
  // name, not their own email; a normal company user is greeted by first name.
  let heading = `Welcome, ${(profile.full_name || profile.email).split(" ")[0]}`;
  let subtitle =
    "Your compliance overview. One glance: are we inspection ready across your team and the people you care for?";
  if (profile.actingAsCompanyId) {
    const { data: co } = await supabase
      .from("companies")
      .select("name")
      .eq("id", profile.actingAsCompanyId)
      .maybeSingle();
    heading = `Support session: ${co?.name ?? "this company"}`;
    subtitle =
      "You are managing this company for support. Its compliance overview is below.";
  }

  // Company-wide People + Service User rollups (RLS scopes each to what this role
  // may see). Both active-only views exclude leavers / cancelled / archived Records.
  const counts = { compliant: 0, dueSoon: 0, overdue: 0 };
  const suCounts = { compliant: 0, dueSoon: 0, overdue: 0 };
  if (profile.company_id) {
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

  // Complaints (Managers + Admins only): open / in progress / overdue response.
  const canSeeComplaints = COMPLAINTS_ROLES.includes(profile.role);
  const complaintCounts =
    canSeeComplaints && profile.company_id
      ? await getComplaintCounts(profile.company_id)
      : { open: 0, inProgress: 0, closed: 0, overdue: 0 };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <RealtimeRefresh />
      <RealtimeRefresh
        tables={["service_users", "check_instances", "service_user_trackers"]}
        channel="service-users-live"
      />
      <div>
        <h1 className="page-title">{heading}</h1>
        <p className="page-subtitle">{subtitle}</p>
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

      {/* Complaints status strip (Managers + Admins) */}
      {canSeeComplaints ? (
        <section aria-label="Complaints status" className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Complaints</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="glass-card p-5">
              <span className="pill-neutral">Open</span>
              <p className="mt-3 text-3xl font-bold text-white">{complaintCounts.open + complaintCounts.inProgress}</p>
              <p className="text-xs text-white/50">Complaints still being handled</p>
            </div>
            <div className="glass-card p-5">
              <span className="pill-red"><span className="pill-dot" /> Overdue</span>
              <p className="mt-3 text-3xl font-bold text-white">{complaintCounts.overdue}</p>
              <p className="text-xs text-white/50">Past their response deadline</p>
            </div>
            <div className="glass-card p-5">
              <span className="pill-green"><span className="pill-dot" /> Closed</span>
              <p className="mt-3 text-3xl font-bold text-white">{complaintCounts.closed}</p>
              <p className="text-xs text-white/50">Complaints resolved and closed</p>
            </div>
          </div>
        </section>
      ) : null}

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

        {canSeeComplaints ? (
          <Link href="/complaints" className="app-tile">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-400/10 text-gold-400">
              <NavIcon icon="complaints" className="h-5 w-5" />
            </span>
            <h2 className="text-base font-semibold text-white">Complaints</h2>
            <p className="text-sm text-white/60">
              Complaints and concerns tracked from raised to resolved, with response
              deadlines and immutable evidence.
            </p>
            <span className="pill-green mt-auto w-fit"><span className="pill-dot" /> Live</span>
          </Link>
        ) : null}
      </section>
    </div>
  );
}
