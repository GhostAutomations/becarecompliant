import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import CompleteTracker from "@/components/people/complete-tracker";
import { getPerson, getCompanyFormByKey } from "@/lib/people/data";
import { TRACKER_FORMS } from "@/lib/people/logic";
import { isFormSchema, type FormSchema } from "@/lib/form-schema";

export const metadata: Metadata = { title: "Record document" };

const MANAGE_ROLES = ["company_admin", "manager", "platform_admin"];

export default async function CompleteTrackerPage({
  params,
}: {
  params: Promise<{ id: string; formKey: string }>;
}) {
  const { profile } = await requireCompany();
  const { id, formKey } = await params;
  if (!profile.company_id) redirect("/people");
  if (!MANAGE_ROLES.includes(profile.role)) redirect(`/people/${id}`);

  const spec = TRACKER_FORMS[formKey];
  if (!spec) redirect(`/people/${id}`);

  const [person, form] = await Promise.all([
    getPerson(id),
    getCompanyFormByKey(profile.company_id, formKey),
  ]);
  if (!person) redirect("/people");

  if (!form || !isFormSchema(form.schema)) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="page-title">{spec.title}</h1>
        <div className="glass-card mt-6 p-6 text-sm text-white/60">
          This form is not available. Please contact your administrator.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <BackLink href={`/people/${id}`} label={`Back to ${person.full_name}`} />
        <h1 className="page-title mt-1">{spec.title}</h1>
        <p className="page-subtitle">
          Completing this form records the date on the register and stores it as
          inspection evidence.
        </p>
      </div>
      <div className="glass-card p-6">
        <CompleteTracker schema={form.schema as FormSchema} personId={id} formKey={formKey} />
      </div>
    </div>
  );
}
