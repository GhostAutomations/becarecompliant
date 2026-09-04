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
import OutcomesIntervalForm from "@/components/service-users/outcomes-interval-form";
import {
  listAllServiceUserCheckDefinitions,
  getServiceUserColumnLabels,
  listBranchTypes,
  getComplexReviewInterval,
  getOutcomesReviewMonths,
} from "@/lib/service-users/data";
import { SU_REGISTER_COLUMNS } from "@/lib/service-users/types";

export const metadata: Metadata = { title: "Service User checks" };

export default async function SettingsServiceUsersPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const [definitions, columnLabels, branchTypes, complexInterval, outcomesMonths, allForms] = await Promise.all([
    listAllServiceUserCheckDefinitions(profile.company_id),
    getServiceUserColumnLabels(profile.company_id),
    listBranchTypes(profile.company_id),
    getComplexReviewInterval(profile.company_id),
    getOutcomesReviewMonths(profile.company_id),
    listCompanyForms(profile.company_id),
  ]);
  const publishableForms = allForms
    .filter((f) => f.population === "service_users" && f.currentVersion != null)
    .map((f) => ({ id: f.id, name: f.name }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
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
            definitions.map((def) => <CheckConfigForm key={def.id} def={def} />)
          )}
          {/* This said Simple branches run "the single annual review", which stopped
              being true when the Care Plan Review moved to quarterly (0227). It also
              read as though Complex meant MORE reviews; both run a rolling review, and
              what Complex changes is that the register shows four numbered slots with
              their own history instead of one rolling due date. Phil, 2026-09-04:
              "there is no annual review". */}
          <p className="page-subtitle pt-2">
            A Complex branch shows the Care Plan Review as four numbered slots (Review 1
            to Review 4) on the register, each one due this many days after the last was
            completed, with its own history. A Simple branch shows one rolling review due
            date, on the Care Plan Review cadence set above.
          </p>
          <ComplexIntervalForm days={complexInterval} />
          <p className="page-subtitle pt-2">
            Active personal outcomes are flagged for a progress update on this cadence,
            separate from the care plan reviews above.
          </p>
          <OutcomesIntervalForm months={outcomesMonths} />
          {/* Live again 2026-08-03 (Item 6): a custom check is what a custom column shows. */}
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
            Rename any register column to match the words your team uses. Edit the
            name in the box; clear it to go back to the default.
          </p>
          <SuColumnNamesForm columns={SU_REGISTER_COLUMNS} labels={columnLabels} />
        </div>
      </details>
    </div>
  );
}
