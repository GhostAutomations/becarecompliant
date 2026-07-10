import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { CreateCompanyForm } from "@/components/founder/create-company-form";
import { setCompanyStatus } from "./actions";
import { computeSeatUsage, formatPence } from "@/lib/billing/seats";

export const metadata: Metadata = { title: "Founder" };

const TIER_LABELS: Record<string, string> = {
  business: "Business",
  pro: "Pro",
  enterprise: "Enterprise",
  diamond: "Diamond",
  black: "Black",
};

function statusPillClass(status: string): string {
  if (status === "active") return "pill-green";
  if (status === "suspended") return "pill-amber";
  return "pill-neutral";
}

export default async function FounderPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const [{ data: companies }, { data: profiles }, { data: invites }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id, name, slug, tier, status, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("company_id, status, role"),
      supabase.from("invites").select("company_id, status"),
    ]);

  const activeUsers = new Map<string, number>();
  for (const p of profiles ?? []) {
    if (p.company_id && p.status === "active" && p.role !== "platform_admin") {
      activeUsers.set(p.company_id, (activeUsers.get(p.company_id) ?? 0) + 1);
    }
  }
  const pendingInvites = new Map<string, number>();
  for (const i of invites ?? []) {
    if (i.company_id && i.status === "pending") {
      pendingInvites.set(i.company_id, (pendingInvites.get(i.company_id) ?? 0) + 1);
    }
  }

  const list = companies ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="page-title">Founder console</h1>
        <p className="page-subtitle">
          Create and manage companies. Company setup is founder led: you create
          the company, set the tier and invite the first Admin.
        </p>
      </div>

      <section aria-label="Library" className="grid gap-4 sm:grid-cols-2">
        <Link href="/founder/forms" className="app-tile">
          <h2 className="text-base font-semibold text-white">Form template library</h2>
          <p className="text-sm text-white/60">
            Curate the master starter forms that seed every new company, using the same
            builder.
          </p>
        </Link>
      </section>

      <section aria-label="Companies" className="space-y-3">
        <h2 className="text-sm font-semibold text-white/80">
          Companies ({list.length})
        </h2>

        {list.length === 0 ? (
          <div className="glass-card px-6 py-12 text-center">
            <p className="text-sm text-white/60">
              No companies yet. Create the first one below.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((company) => {
              const seats = computeSeatUsage(activeUsers.get(company.id) ?? 0);
              const pending = pendingInvites.get(company.id) ?? 0;
              return (
                <div key={company.id} className="glass-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-white">
                          {company.name}
                        </h3>
                        <span className={statusPillClass(company.status)}>
                          {company.status}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-white/50">
                        {TIER_LABELS[company.tier] ?? company.tier} tier ·{" "}
                        {company.slug}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {company.status !== "active" ? (
                        <form action={setCompanyStatus}>
                          <input type="hidden" name="company_id" value={company.id} />
                          <input type="hidden" name="status" value="active" />
                          <button type="submit" className="btn-ghost px-3 py-1.5 text-xs">
                            Activate
                          </button>
                        </form>
                      ) : null}
                      {company.status !== "suspended" &&
                      company.status !== "archived" ? (
                        <form action={setCompanyStatus}>
                          <input type="hidden" name="company_id" value={company.id} />
                          <input type="hidden" name="status" value="suspended" />
                          <button type="submit" className="btn-ghost px-3 py-1.5 text-xs">
                            Suspend
                          </button>
                        </form>
                      ) : null}
                      {company.status !== "archived" ? (
                        <form action={setCompanyStatus}>
                          <input type="hidden" name="company_id" value={company.id} />
                          <input type="hidden" name="status" value="archived" />
                          <button type="submit" className="btn-ghost px-3 py-1.5 text-xs">
                            Archive
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/60">
                    <span>
                      Seats: <span className="text-white/90">{seats.used}</span>{" "}
                      used of {seats.included} included
                    </span>
                    <span>
                      Extra billable:{" "}
                      <span className="text-white/90">{seats.extra}</span> (
                      {formatPence(seats.extraCostPence)}/mo)
                    </span>
                    <span>
                      Pending invites:{" "}
                      <span className="text-white/90">{pending}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section aria-label="Create a company" className="glass-card p-6">
        <h2 className="mb-1 text-base font-semibold text-white">
          Create a company
        </h2>
        <p className="mb-5 text-sm text-white/60">
          Seeds one Team (office) and one Branch. Additional branches are a paid
          add on, added later.
        </p>
        <CreateCompanyForm />
      </section>
    </div>
  );
}
