import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/guards";
import { SidebarNav, MobileDock } from "@/components/app-nav";
import { ROLE_LABELS, navEntriesForRole } from "@/lib/nav";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile } = await requireProfile();
  // Invited users must finish setup (set a password) before using the app.
  if (profile.status === "invited") redirect("/welcome");
  const displayName = profile.full_name || profile.email;
  const navEntries = navEntriesForRole(profile.role);

  return (
    <div className="app-bg flex h-dvh overflow-hidden">
      {/* Gradient sidebar (desktop) */}
      <aside className="sidebar-gradient hidden h-dvh w-44 shrink-0 flex-col px-3 py-4 md:flex">
        <Link
          href="/dashboard"
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

        <p className="mt-auto px-3 pb-2 text-[11px] text-white/40">
          Forms, reports and settings arrive in later phases.
        </p>
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

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-6 md:px-8 md:pb-8">
          {children}
        </main>
      </div>

      <MobileDock entries={navEntries} />
    </div>
  );
}
