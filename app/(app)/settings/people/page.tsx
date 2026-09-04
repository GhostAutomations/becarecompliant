import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { listAllPeopleCheckDefinitions, getColumnLabels, getProbationPeriod, listJobTitles } from "@/lib/people/data";
import { REGISTER_COLUMNS } from "@/lib/people/logic";
import CheckConfigForm from "@/components/people/check-config-form";
import CreateCheckTypeForm from "@/components/people/create-check-type-form";
import ColumnNamesForm from "@/components/people/column-names-form";
import ProbationPeriodForm from "@/components/people/probation-period-form";
import JobTitlesForm from "@/components/people/job-titles-form";
import CourseConfig from "@/components/training/course-config";
import { listAllCourses } from "@/lib/training/data";
import { listCompanyForms } from "@/lib/form-builder/data";

export const metadata: Metadata = { title: "People checks" };

export default async function SettingsPeoplePage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const [definitions, columnLabels, probationPeriod, allForms, courses, jobTitles] = await Promise.all([
    listAllPeopleCheckDefinitions(profile.company_id),
    getColumnLabels(profile.company_id),
    getProbationPeriod(profile.company_id),
    listCompanyForms(profile.company_id),
    listAllCourses(profile.company_id),
    listJobTitles(profile.company_id),
  ]);
  const publishableForms = allForms
    .filter((f) => f.population === "people" && f.currentVersion != null)
    .map((f) => ({ id: f.id, name: f.name }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <BackLink href="/settings" label="Back to Settings" />
        <h1 className="page-title mt-1">People settings</h1>
        <p className="page-subtitle">Configure staff checks, probation and register columns.</p>
      </div>

      <details className="glass-card section-card">
        <summary>People checks</summary>
        <div className="space-y-3 border-t border-white/10 p-5">
          <p className="page-subtitle">
            Set how often each staff compliance check recurs. Changes apply to future
            scheduling; the amber window updates the register straight away.
          </p>
          {definitions.map((def) => (
            <CheckConfigForm key={def.id} def={def} />
          ))}
          {/* Live again 2026-08-03 (Item 6): a custom check is what a custom column shows. */}
          <div className="border-t border-white/10 pt-4">
            <CreateCheckTypeForm population="people" forms={publishableForms} />
          </div>
        </div>
      </details>

      <details className="glass-card section-card">
        <summary>Training courses</summary>
        <div className="border-t border-white/10 p-5">
          <CourseConfig courses={courses} />
        </div>
      </details>

      <details className="glass-card section-card">
        <summary>Job titles</summary>
        <div className="border-t border-white/10 p-5">
          <JobTitlesForm titles={jobTitles} />
        </div>
      </details>

      <details className="glass-card section-card">
        <summary>Probation</summary>
        <div className="border-t border-white/10 p-5">
          <p className="page-subtitle mb-3">
            The probationary period used to set a new carer&rsquo;s probation end due
            date. Set it the way your employment contract words it &mdash; in days,
            weeks or months.
          </p>
          <ProbationPeriodForm period={probationPeriod} />
        </div>
      </details>

      <details className="glass-card section-card">
        <summary>Column names</summary>
        <div className="border-t border-white/10 p-5">
          <p className="page-subtitle mb-3">
            Rename any register column to match the words your team uses. Edit the
            name in the box; clear it to go back to the default.
          </p>
          <ColumnNamesForm columns={REGISTER_COLUMNS} labels={columnLabels} />
        </div>
      </details>
    </div>
  );
}
