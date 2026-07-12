import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import BranchForm from "@/components/settings/branch-form";

export const metadata: Metadata = { title: "Branches" };

export default async function BranchesPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const supabase = await createClient();
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, kind, status, address")
    .eq("company_id", profile.company_id)
    .order("kind", { ascending: true })
    .order("name", { ascending: true });

  const list = branches ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <BackLink href="/settings" label="Back to Settings" />
        <h1 className="page-title mt-1">Branches</h1>
        <p className="page-subtitle">
          Each company includes one Team (office) and one Branch. Records belong
          to exactly one branch.
        </p>
      </div>

      <div className="space-y-3">
        {list.map((branch) => (
          <div key={branch.id} className="glass-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <span
                className={branch.kind === "team" ? "pill-neutral" : "pill-green"}
              >
                {branch.kind === "team" ? "Team" : "Branch"}
              </span>
              <span className="text-xs text-white/50">{branch.status}</span>
            </div>
            <BranchForm
              branchId={branch.id}
              initialName={branch.name}
              initialAddress={branch.address ?? ""}
            />
          </div>
        ))}
      </div>

      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white/80">
          Additional branches
        </h2>
        <p className="mt-2 text-sm text-white/60">
          Extra branches are a paid add on. This arrives with billing in a later
          phase.
        </p>
      </div>
    </div>
  );
}
