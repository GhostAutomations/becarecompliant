import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import SupportModeNotice from "@/components/support-mode-notice";
import CompleteTracker from "@/components/people/complete-tracker";
import { readDraft } from "@/lib/forms/draft-store";
import { trackerDraftKey } from "@/lib/forms/draft-key";
import { getPerson, getCompanyFormByKey } from "@/lib/people/data";
import { TRACKER_FORMS } from "@/lib/people/logic";
import { isFormSchema, type FormSchema } from "@/lib/form-schema";
import { REGISTER_ROLES as MANAGE_ROLES } from "@/lib/auth/module-roles";
import { getCompanyRow } from "@/lib/companies/row";

export const metadata: Metadata = { title: "Record document" };


export default async function CompleteTrackerPage({
  params,
}: {
  params: Promise<{ id: string; formKey: string }>;
}) {
  const { profile } = await requireCompany();
  const { id, formKey } = await params;
  if (!profile.company_id) redirect("/people");
  if (!MANAGE_ROLES.includes(profile.role)) redirect(`/people/${id}`);
  if (profile.actingAsCompanyId) {
    return (
      <SupportModeNotice
        backHref={`/people/${id}`}
        backLabel="Back to the record"
        what="record this document"
      />
    );
  }

  const spec = TRACKER_FORMS[formKey];
  if (!spec) redirect(`/people/${id}`);

  const [person, form, company] = await Promise.all([
    getPerson(id),
    getCompanyFormByKey(profile.company_id, formKey),
    getCompanyRow(profile.company_id),
  ]);
  if (!person) redirect("/people");

  /* A form that follows the regulator cannot show the right rules without one, so it says so
     rather than guessing England or Wales (Phil, 2026-10-05). */
  const regulator = company?.regulator === "cqc" || company?.regulator === "ciw" ? company.regulator : null;
  if (spec.regulatorAware && !regulator) {
    return (
      <div className="page-form space-y-6">
        <div>
          <BackLink href={`/people/${id}`} label={`Back to ${person.full_name}`} />
          <h1 className="page-title mt-1">{spec.title}</h1>
        </div>
        <div className="glass-card p-6 text-sm text-white/70">
          Your company does not have a regulator set (CQC or CIW), so this form cannot show the
          right rules. Please ask Be Care Compliant support to set it.
        </div>
      </div>
    );
  }

  if (!form || !isFormSchema(form.schema)) {
    return (
      <div className="page-form">
        <h1 className="page-title">{spec.title}</h1>
        <div className="glass-card mt-6 p-6 text-sm text-white/60">
          This form is not available. Please contact your administrator.
        </div>
      </div>
    );
  }

  /* What this user had already typed into this form, if they were interrupted in the
     last twelve hours (see lib/forms/draft-key.ts). */
  const draft = await readDraft(trackerDraftKey(id, formKey));

  return (
    <div className="page-form space-y-6">
      <div>
        <BackLink href={`/people/${id}`} label={`Back to ${person.full_name}`} />
        <h1 className="page-title mt-1">{spec.title}</h1>
        <p className="page-subtitle">
          {spec.subtitle ??
            "Completing this form records the date on the register and stores it as inspection evidence."}
        </p>
      </div>
      <div className="glass-card p-6">
        <CompleteTracker schema={form.schema as FormSchema} personId={id} formKey={formKey} draft={draft} startDate={person.start_date} presets={spec.regulatorAware && regulator ? { regulator } : undefined} />
      </div>
    </div>
  );
}
