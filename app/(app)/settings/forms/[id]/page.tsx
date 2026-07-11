import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { getFormForEdit, listQuestionBank } from "@/lib/form-builder/data";
import BuilderShell from "@/components/form-builder/builder-shell";

export const metadata: Metadata = { title: "Edit form" };

export default async function EditFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const form = await getFormForEdit(profile.company_id, id);
  if (!form) notFound();
  const bank = await listQuestionBank(form.population);

  // Load the draft if one is open, else the published version, else a blank shell.
  const editable = form.draft != null;
  const schema =
    form.draft?.schema ??
    form.published?.schema ?? {
      schemaVersion: 1,
      sections: [{ id: "section-1", title: "Section 1", fields: [] }],
    };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <BackLink href="/settings/forms" label="Back to Forms" />
        <h1 className="page-title mt-1">{form.name}</h1>
        <p className="page-subtitle">
          {editable
            ? "Editing a draft. Save to keep working, Publish to make it the live version."
            : "Viewing the published form. Edit to start a new draft."}
        </p>
      </div>

      <BuilderShell
        kind="company"
        formId={form.id}
        name={form.name}
        population={form.population}
        editable={editable}
        draftVersionId={form.draft?.versionId ?? null}
        schema={schema}
        currentVersion={form.currentVersion}
        versions={form.versions}
        bank={bank}
      />
    </div>
  );
}
