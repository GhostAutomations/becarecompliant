import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import IncidentReportForm from "@/components/incidents/report-form";
import { getCompanyFormByKey } from "@/lib/people/data";
import { readDraft } from "@/lib/forms/draft-store";
import { draftKey } from "@/lib/forms/draft-key";
import { isFormSchema, type FormSchema } from "@/lib/form-schema";
import { INCIDENT_REPORT_FORM } from "@/lib/incidents/report-actions";

export const metadata: Metadata = { title: "Report an incident" };

/**
 * REPORTING IS OPEN TO THE WHOLE COMPANY (Phil, 2026-09-18).
 *
 * Every other page under /incidents guards on INCIDENTS_ROLES, and this one deliberately does
 * not: the person who saw an incident is usually a carer, and until now the only way they could
 * report one was to tell somebody who could reach this module, or fill in a form on another
 * system entirely. Reporting is open; everything that happens to the case afterwards -- the
 * register, the investigation, the outcome -- stays with the branch.
 */
export default async function NewIncidentPage() {
  const { profile } = await requireCompany();
  if (!profile.company_id) redirect("/dashboard");

  const form = await getCompanyFormByKey(profile.company_id, INCIDENT_REPORT_FORM);
  if (!form || !isFormSchema(form.schema)) {
    return (
      <div className="page-form space-y-6">
        <BackLink href="/dashboard" label="Back" />
        <h1 className="page-title mt-1">Report an incident</h1>
        <div className="glass-card mt-6 p-6 text-sm text-white/60">
          The incident report form is not available. Please contact your administrator.
        </div>
      </div>
    );
  }

  const draft = await readDraft(draftKey("incident", ["report"]));

  return (
    <div className="page-form space-y-6">
      <div>
        <BackLink href="/dashboard" label="Back" />
        <h1 className="page-title mt-1">Report an incident</h1>
        <p className="page-subtitle">
          Write down what happened while it is fresh, in your own words. Filing this opens a
          case, and the branch takes it from there.
        </p>
      </div>

      <div className="glass-card p-6">
        <IncidentReportForm schema={form.schema as FormSchema} draft={draft} />
      </div>
    </div>
  );
}
