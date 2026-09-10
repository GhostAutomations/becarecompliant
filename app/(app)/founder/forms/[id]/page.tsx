import type { Metadata } from "next";
import Link from "next/link";
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
    <div className="w-full space-y-6">
      <div>
        <BackLink href="/founder/forms" label="Back to template library" />
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <h1 className="page-title">{template.name}</h1>
          {/* Saving still only changes the library. Offering the change to the companies
              who already hold it is a separate, deliberate act (Phil, 2026-09-10). */}
          <Link href={`/founder/forms/${template.id}/push`} className="btn-outline">
            Send to companies
          </Link>
        </div>
        <p className="page-subtitle">
          Editing the master template. Saving changes the library only. Use Send to companies
          to offer the change to companies that already hold this form; any company that has
          edited their own copy is left alone.
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
