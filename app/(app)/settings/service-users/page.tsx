import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import CheckConfigForm from "@/components/people/check-config-form";
import SuColumnNamesForm from "@/components/service-users/su-column-names-form";
import {
  listAllServiceUserCheckDefinitions,
  getServiceUserColumnLabels,
} from "@/lib/service-users/data";
import { SU_REGISTER_COLUMNS } from "@/lib/service-users/types";

export const metadata: Metadata = { title: "Service User checks" };

export default async function SettingsServiceUsersPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const [definitions, columnLabels] = await Promise.all([
    listAllServiceUserCheckDefinitions(profile.company_id),
    getServiceUserColumnLabels(profile.company_id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <BackLink href="/settings" label="Back to Settings" />
        <h1 className="page-title mt-1">Service User settings</h1>
        <p className="page-subtitle">Configure service user checks and register columns.</p>
      </div>

      <details className="glass-card section-card" open>
        <summary>Service User checks</summary>
        <div className="space-y-3 border-t border-white/10 p-5">
          <p className="page-subtitle">
            Set how often each service user compliance check recurs. Changes apply to
            future scheduling; the amber window updates the register straight away.
          </p>
          {definitions.length === 0 ? (
            <p className="text-sm text-white/60">
              No service user checks are configured yet. They are seeded from the starter
              form library when the company is set up.
            </p>
          ) : (
            definitions.map((def) => <CheckConfigForm key={def.id} def={def} />)
          )}
          <p className="text-xs text-white/40">
            Creating brand new check types with their own forms arrives with the form
            builder in a later phase.
          </p>
        </div>
      </details>

      <details className="glass-card section-card">
        <summary>Column names</summary>
        <div className="border-t border-white/10 p-5">
          <p className="page-subtitle mb-3">
            Give any register column a shorthand to make it narrower, so more columns
            fit on screen. Leave blank to use the full name.
          </p>
          <SuColumnNamesForm columns={SU_REGISTER_COLUMNS} labels={columnLabels} />
        </div>
      </details>
    </div>
  );
}
