import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { listAllPeopleCheckDefinitions, getColumnLabels, getProbationPeriod } from "@/lib/people/data";
import { REGISTER_COLUMNS } from "@/lib/people/logic";
import CheckConfigForm from "@/components/people/check-config-form";
import ColumnNamesForm from "@/components/people/column-names-form";
import ProbationPeriodForm from "@/components/people/probation-period-form";

export const metadata: Metadata = { title: "People checks" };

export default async function SettingsPeoplePage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const [definitions, columnLabels, probationDays] = await Promise.all([
    listAllPeopleCheckDefinitions(profile.company_id),
    getColumnLabels(profile.company_id),
    getProbationPeriod(profile.company_id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <BackLink href="/settings" label="Back to Settings" />
        <h1 className="page-title mt-1">People checks</h1>
        <p className="page-subtitle">
          Set how often each staff compliance check recurs. Changes apply to future
          scheduling; the amber window updates the register straight away.
        </p>
      </div>

      <div className="space-y-3">
        {definitions.map((def) => (
          <CheckConfigForm key={def.id} def={def} />
        ))}
      </div>

      <div className="pt-2">
        <h2 className="page-title text-lg">Probation</h2>
        <p className="page-subtitle mb-3">
          The probationary period used to set a new carer&rsquo;s probation end due date.
        </p>
        <ProbationPeriodForm days={probationDays} />
      </div>

      <p className="text-xs text-white/40">
        Creating brand new check types with their own forms arrives with the form
        builder in a later phase.
      </p>

      <div className="pt-4">
        <h2 className="page-title text-lg">Column names</h2>
        <p className="page-subtitle mb-3">
          Give any register column a shorthand to make it narrower, so more columns
          fit on screen. Leave blank to use the full name.
        </p>
        <ColumnNamesForm columns={REGISTER_COLUMNS} labels={columnLabels} />
      </div>
    </div>
  );
}
