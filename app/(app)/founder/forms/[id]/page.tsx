import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { getTemplateForEdit, listQuestionBank } from "@/lib/form-builder/data";
import BuilderShell from "@/components/form-builder/builder-shell";
import { blankSchema } from "@/lib/form-builder/schema-ops";

export const metadata: Metadata = { title: "Edit template" };

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePlatformAdmin();

  const template = await getTemplateForEdit(id);
  if (!template) notFound();
  const bank = await listQuestionBank(template.population);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <BackLink href="/founder/forms" label="Back to template library" />
        <h1 className="page-title mt-1">{template.name}</h1>
        <p className="page-subtitle">
          Editing the master template. Save writes a new version of the master; existing
          companies keep the copy they already seeded.
        </p>
      </div>

      <BuilderShell
        kind="template"
        templateId={template.id}
        name={template.name}
        population={template.population}
        schema={template.schema ?? blankSchema()}
        version={template.version}
        bank={bank}
      />
    </div>
  );
}
