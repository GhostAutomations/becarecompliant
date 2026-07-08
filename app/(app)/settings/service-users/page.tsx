import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Service User checks" };

export default async function SettingsServiceUsersPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/settings" className="text-xs text-white/50 hover:text-white/80">
          Settings
        </Link>
        <h1 className="page-title mt-1">Service User checks</h1>
        <p className="page-subtitle">
          Set how often each service user compliance check recurs.
        </p>
      </div>

      <div className="glass-card flex flex-col items-center gap-3 px-6 py-16 text-center">
        <h2 className="text-base font-semibold text-white">Arrives with Service Users</h2>
        <p className="max-w-md text-sm text-white/60">
          Care plan reviews, risk assessments, medication audits and consent reviews
          are configured here once the Service Users section is built. The People
          checks are ready now.
        </p>
        <Link href="/settings/people" className="btn-outline mt-2">
          Configure People checks
        </Link>
      </div>
    </div>
  );
}
