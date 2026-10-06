import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { canWritePolicies, requireCompany } from "@/lib/auth/guards";
import { isCarerLogin } from "@/lib/auth/carer-login";
import PolicyLibrary from "@/components/settings/policy-library";
import { listPolicies, getPolicyConfig } from "@/lib/assignments/data";

/**
 * Policies, a department of its own (Phil, 2026-10-06: "make that its own department, still
 * where a company can upload their policies but also where they can create a policy or have
 * their policy improved"). It was a tile in Settings.
 *
 * Admins write and approve: the library below, exactly as it was in Settings. A company can
 * give Managers, Registered Managers and Registered Individuals the same in Role access (0399).
 * Everyone else here reads every policy and sends them out from Briefings.
 */

export const metadata: Metadata = { title: "Policies" };

const READERS = ["platform_admin", "company_admin", "registered_individual", "registered_manager", "manager"];

export default async function PoliciesPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/founder");
  if (isCarerLogin(profile.role)) redirect("/my");
  if (!READERS.includes(profile.role)) redirect("/dashboard");
  /* Admins, and any role the company has ticked "Can write and approve" in Role access (0399). */
  const isAdmin =
    profile.role === "company_admin" || profile.role === "platform_admin" || (await canWritePolicies(profile.company_id));

  const [policies, config] = await Promise.all([
    listPolicies(profile.company_id, true),
    isAdmin ? getPolicyConfig(profile.company_id) : Promise.resolve(null),
  ]);
  const active = policies.filter((p) => p.status === "active");
  const archived = policies.filter((p) => p.status === "archived");

  return (
    <div className="page-shell space-y-6">
      <div>
        <h1 className="page-title">Policies</h1>
        <p className="page-subtitle">
          Your company&apos;s policies in one place. Send them out from{" "}
          <Link href="/briefings" className="text-gold-300 underline underline-offset-4 hover:text-gold-400">Briefings</Link>: your team reads each one and signs it,
          and the signature is stored as Evidence with the version they signed.
        </p>
      </div>

      {isAdmin && config ? (
        <PolicyLibrary policies={active} config={config} />
      ) : active.length === 0 ? (
        <div className="glass-card p-6 text-sm text-white/60">
          No policies have been added yet. Your Admin adds them here.
        </div>
      ) : (
        <div className="glass-card divide-y divide-white/10">
          {active.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{p.title}</p>
                <p className="text-xs text-white/50">Version {p.version}</p>
              </div>
              <a href={`/api/policies/${p.id}/file`} target="_blank" rel="noreferrer" className="btn-outline">
                Open
              </a>
            </div>
          ))}
        </div>
      )}

      {isAdmin && archived.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Archived</h2>
          <div className="glass-card divide-y divide-white/10">
            {archived.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                <p className="truncate text-sm text-white/70">{p.title}</p>
                <span className="pill pill-neutral">Archived</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
