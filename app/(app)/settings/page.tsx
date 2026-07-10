import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getSeatUsage, formatPence } from "@/lib/billing/seats";

export const metadata: Metadata = { title: "Settings" };

const TIER_LABELS: Record<string, string> = {
  business: "Business",
  pro: "Pro",
  enterprise: "Enterprise",
  diamond: "Diamond",
  black: "Black",
};

export default async function SettingsPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const supabase = await createClient();
  const [{ data: company }, seats] = await Promise.all([
    supabase
      .from("companies")
      .select("name, tier, status")
      .eq("id", profile.company_id)
      .maybeSingle(),
    getSeatUsage(profile.company_id),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">
          Manage your company, branches and team.
        </p>
      </div>

      <section className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">Company</h2>
        <p className="mt-2 text-lg font-semibold text-white">
          {company?.name ?? "Your company"}
        </p>
        <p className="text-xs text-white/50">
          {TIER_LABELS[company?.tier ?? ""] ?? company?.tier} tier ·{" "}
          {company?.status}
        </p>
      </section>

      <section className="glass-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white/80">Seats</h2>
            <p className="mt-2 text-3xl font-bold text-white">
              {seats.used}
              <span className="text-base font-medium text-white/50">
                {" "}
                of {seats.included} included
              </span>
            </p>
          </div>
          <Link href="/settings/users" className="btn-outline px-3 py-2 text-xs">
            Manage users
          </Link>
        </div>
        <p className="mt-3 text-sm text-white/60">
          {seats.extra > 0 ? (
            <>
              {seats.extra} extra{" "}
              {seats.extra === 1 ? "seat" : "seats"} at{" "}
              {formatPence(500)} each:{" "}
              <span className="font-semibold text-white/90">
                {formatPence(seats.extraCostPence)}/mo
              </span>
              . Billing is set up in a later phase.
            </>
          ) : (
            <>You are within your included seats. Extra users are £5 each per month.</>
          )}
        </p>
      </section>

      <section aria-label="Sections" className="grid gap-4 sm:grid-cols-2">
        <Link href="/settings/branches" className="app-tile">
          <h2 className="text-base font-semibold text-white">Branches</h2>
          <p className="text-sm text-white/60">
            Your Team (office) and Branch. Rename them or view their details.
          </p>
        </Link>
        <Link href="/settings/users" className="app-tile">
          <h2 className="text-base font-semibold text-white">Users and invites</h2>
          <p className="text-sm text-white/60">
            Invite your team, set roles and branches, and manage pending invites.
          </p>
        </Link>
        <Link href="/settings/forms" className="app-tile">
          <h2 className="text-base font-semibold text-white">Forms</h2>
          <p className="text-sm text-white/60">
            Build and edit the forms your team completes as compliance Evidence, with
            versions and a live preview.
          </p>
        </Link>
        <Link href="/settings/people" className="app-tile">
          <h2 className="text-base font-semibold text-white">People checks</h2>
          <p className="text-sm text-white/60">
            Set how often each staff check recurs: supervisions, spot checks, DBS,
            right to work and more.
          </p>
        </Link>
        <Link href="/settings/service-users" className="app-tile">
          <h2 className="text-base font-semibold text-white">Service User checks</h2>
          <p className="text-sm text-white/60">
            Care plan reviews, risk assessments and medication audits. Arrives with
            Service Users.
          </p>
        </Link>
      </section>
    </div>
  );
}
