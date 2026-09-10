import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import LibraryPush from "@/components/founder/library-push";
import { getTemplateForEdit } from "@/lib/form-builder/data";
import { libraryPushView } from "@/lib/forms/library-push";

export const metadata: Metadata = { title: "Send to companies" };

export default async function PushTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePlatformAdmin();

  const template = await getTemplateForEdit(id);
  if (!template) notFound();
  const view = await libraryPushView(template.key);
  if (!view) notFound();

  const ready = view.companies.filter((c) => c.state === "behind").length;

  return (
    <div className="page-form-wide space-y-6">
      <div>
        <BackLink href={`/founder/forms/${id}`} label={`Back to ${template.name}`} />
        <h1 className="page-title mt-1">Send {template.name} to companies</h1>
        <p className="page-subtitle">
          {ready === 0
            ? "Every company holding this form is either already on this version or has made it their own."
            : `${ready} ${ready === 1 ? "company is" : "companies are"} still on an older version of this form and have not changed their copy.`}
        </p>
      </div>

      <div className="glass-card p-6">
        <LibraryPush
          templateKey={view.templateKey}
          libraryVersion={view.libraryVersion}
          companies={view.companies}
        />
      </div>
    </div>
  );
}
