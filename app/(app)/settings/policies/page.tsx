import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import PolicyLibrary from "@/components/settings/policy-library";
import { listPolicies, getPolicyConfig } from "@/lib/assignments/data";

/**
 * Settings > Policies. The company's policy documents, uploaded once and then
 * assigned to whoever has to read them. A confirmation is stored as Evidence, so
 * "everyone has read the medication policy" stops being a claim and becomes a
 * list with dates on it.
 */

export const metadata: Metadata = { title: "Policies" };

export default async function PoliciesSettingsPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const [policies, config] = await Promise.all([
    listPolicies(profile.company_id, true),
    getPolicyConfig(profile.company_id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/settings" label="Back to Settings" />
      <div>
        <h1 className="page-title">Policies</h1>
        <p className="page-subtitle">
          Upload your policies once, then send them out from Briefings. Your team
          reads the document and signs it, and the signature is stored as Evidence with the
          version they signed and a certificate you can hand to an inspector.
        </p>
      </div>

      <PolicyLibrary policies={policies.filter((p) => p.status === "active")} config={config} />

      {policies.some((p) => p.status === "archived") && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
            Archived
          </h2>
          <div className="glass-card divide-y divide-white/10">
            {policies
              .filter((p) => p.status === "archived")
              .map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                  <p className="truncate text-sm text-white/70">{p.title}</p>
                  <span className="pill pill-neutral">Archived</span>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
