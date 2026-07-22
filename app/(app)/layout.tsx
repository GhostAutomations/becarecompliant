import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { readActingCompanyId } from "@/lib/founder/manage-as";
import { ManageAsBanner } from "@/components/founder/manage-as-banner";
import { SidebarNav, MobileDock } from "@/components/app-nav";
import ToastHost from "@/components/toast-host";
import { ROLE_LABELS, navEntriesForRole } from "@/lib/nav";
import { featureEnabled } from "@/lib/billing/tier";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile } = await requireProfile();
  // Invited users must finish setup (set a password) before using the app.
  if (profile.status === "invited") redirect("/welcome");
  const displayName = profile.full_name || profile.email;

  // Manage-as: when the founder is acting inside a tenant, show that company's
  // nav and a persistent banner. profile stays the real platform admin here.
  const actingCompanyId =
    profile.role === "platform_admin" ? await readActingCompanyId() : null;
  let actingCompanyName: string | null = null;
  if (actingCompanyId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("companies")
      .select("name")
      .eq("id", actingCompanyId)
      .maybeSingle();
    actingCompanyName = data?.name ?? "this company";
  }
  // Complaints and Invoicing are Pro features: hide their nav entries for
  // companies without them.
  const navCompanyId = actingCompanyId ?? profile.company_id;
  const [complaintsEnabled, invoicingEnabled, outcomesSatisfactionEnabled, plannerEnabled] = navCompanyId
    ? await Promise.all([
        featureEnabled(navCompanyId, "complaints"),
        featureEnabled(navCompanyId, "invoicing"),
        featureEnabled(navCompanyId, "outcomes_satisfaction"),
        featureEnabled(navCompanyId, "planner"),
      ])
    : [true, true, true, true];
  // Inspection Readiness is a per-company beta flag (hidden unless switched on).
  let readinessEnabled = false;
  if (navCompanyId) {
    const supabase = await createClient();
    const { data: co } = await supabase
      .from("companies")
      .select("framework_enabled")
      .eq("id", navCompanyId)
      .maybeSingle();
    readinessEnabled = !!co?.framework_enabled;
  }
  const navEntries = navEntriesForRole(
    actingCompanyId ? "company_admin" : profile.role,
  )
    .filter((e) => e.href !== "/complaints" || complaintsEnabled)
    .filter((e) => e.href !== "/invoicing" || invoicingEnabled)
    .filter((e) => e.href !== "/planner" || plannerEnabled)
    .filter((e) => e.href !== "/readiness" || readinessEnabled)
    // Outcomes + Satisfaction are Pro sub-departments under Service Users.
    .map((e) =>
      e.href === "/service-users" && !outcomesSatisfactionEnabled
        ? {
            ...e,
            children: (e.children ?? []).filter(
              (c) => c.href !== "/service-users/outcomes" && c.href !== "/service-users/satisfaction",
            ),
          }
        : e,
    );
  // The founder's home is the Founder console; everyone else (and the founder
  // while managing as a company) homes to the dashboard.
  const homeHref =
    profile.role === "platform_admin" && !actingCompanyId ? "/founder" : "/dashboard";

  return (
    <div className="app-bg flex h-dvh overflow-hidden">
      {/* Gradient sidebar (desktop) */}
      <aside className="sidebar-gradient hidden h-dvh w-44 shrink-0 flex-col px-3 py-4 md:flex">
        <Link
          href={homeHref}
          className="mb-8 flex items-center gap-2.5 px-2 pt-2"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold-400/15 ring-1 ring-gold-400/40">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.8"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
            </svg>
          </span>
          <span className="text-sm font-bold leading-tight text-white">
            Be Care
            <br />
            <span className="text-gold-400">Compliant</span>
          </span>
        </Link>

        <SidebarNav entries={navEntries} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Frosted topbar */}
        <header className="topbar flex shrink-0 items-center justify-between gap-3 px-4 py-3 md:px-8">
          <span className="text-sm font-bold text-white md:hidden">
            Be Care <span className="text-gold-400">Compliant</span>
          </span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm font-medium text-white/80 sm:block">
              {displayName}
            </span>
            <span className="pill-neutral">
              {ROLE_LABELS[profile.role] ?? profile.role}
            </span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="btn-ghost px-3 py-2 text-xs">
                Sign out
              </button>
            </form>
          </div>
        </header>

        {actingCompanyName ? (
          <ManageAsBanner companyName={actingCompanyName} />
        ) : null}

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-6 md:px-8 md:pb-8">
          {children}
        </main>
      </div>

      <MobileDock entries={navEntries} />
      <ToastHost />
    </div>
  );
}
