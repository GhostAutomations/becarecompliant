import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import CheckConfigForm from "@/components/people/check-config-form";
import CreateCheckTypeForm from "@/components/people/create-check-type-form";
import SuColumnNamesForm from "@/components/service-users/su-column-names-form";
import { listCompanyForms } from "@/lib/form-builder/data";
import BranchTypeForm from "@/components/service-users/branch-type-form";
import ComplexIntervalForm from "@/components/service-users/complex-interval-form";
import {
  listAllServiceUserCheckDefinitions,
  getServiceUserColumnLabels,
  listBranchTypes,
  getComplexReviewInterval,
} from "@/lib/service-users/data";
import { SU_REGISTER_COLUMNS } from "@/lib/service-users/types";

export const metadata: Metadata = { title: "Service User checks" };

export default async function SettingsServiceUsersPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const [definitions, columnLabels, branchTypes, complexInterval, allForms] = await Promise.all([
    listAllServiceUserCheckDefinitions(profile.company_id),
    getServiceUserColumnLabels(profile.company_id),
    listBranchTypes(profile.company_id),
    getComplexReviewInterval(profile.company_id),
    listCompanyForms(profile.company_id),
  ]);
  const publishableForms = allForms
    .filter((f) => f.population === "service_users" && f.currentVersion != null)
    .map((f) => ({ id: f.id, name: f.name }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <BackLink href="/settings" label="Back to Settings" />
        <h1 className="page-title mt-1">Service User settings</h1>
        <p className="page-subtitle">Configure service user checks and register columns.</p>
      </div>

      <details className="glass-card section-card">
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
            definitions.map((def) => (
              <CheckConfigForm key={def.id} def={def} forms={publishableForms} />
            ))
          )}
          <p className="page-subtitle pt-2">
            Complex branches run four rolling Care Plan Reviews (REV1 to REV4) at this
            cadence instead of the single annual review used by Simple branches.
          </p>
          <ComplexIntervalForm days={complexInterval} />
          <div className="border-t border-white/10 pt-4">
            <CreateCheckTypeForm population="service_users" forms={publishableForms} />
          </div>
        </div>
      </details>

      <details className="glass-card section-card">
        <summary>Service Users Type</summary>
        <div className="space-y-3 border-t border-white/10 p-5">
          <p className="page-subtitle">
            Set whether each branch runs a Simple or Complex Service User setup. Every
            branch defaults to Simple. Branches are created elsewhere; this only sets
            the type.
          </p>
          <BranchTypeForm branches={branchTypes} />
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
