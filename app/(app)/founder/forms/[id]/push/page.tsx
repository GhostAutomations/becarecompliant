import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import LibraryPush from "@/components/founder/library-push";
import LibraryGive from "@/components/founder/library-give";
import { getTemplateForEdit } from "@/lib/form-builder/data";
import { companiesWithoutForm, libraryPushView } from "@/lib/forms/library-push";

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
  const [view, without] = await Promise.all([libraryPushView(template.key), companiesWithoutForm(template.key)]);
  if (!view) notFound();

  const ready = view.companies.filter((c) => c.state === "behind").length;

  return (
    <div className="page-form-wide space-y-6">
      <div>
        <BackLink href={`/founder/forms/${id}`} label={`Back to ${template.name}`} />
        <h1 className="page-title mt-1">Send {template.name} to companies</h1>
        <p className="page-subtitle">
          {view.companies.length === 0
            ? "No company has this form yet. Give it to one below, or to a few."
            : ready === 0
            ? "Every company holding this form is either already on this version or has made it their own."
            : `${ready} ${ready === 1 ? "company is" : "companies are"} still on an older version of this form and have not changed their copy.`}
        </p>
      </div>

      <div className="glass-card space-y-3 p-6">
        <h2 className="text-sm font-semibold text-white/80">Companies that have it</h2>
        <LibraryPush templateKey={view.templateKey} companies={view.companies} />
      </div>

      {/* GIVE TO A COMPANY (Phil, 2 Oct 2026): pick one company, or a few, that do not have it yet. */}
      <div className="glass-card space-y-3 p-6">
        <h2 className="text-sm font-semibold text-white/80">Give it to a company that does not have it</h2>
        <LibraryGive templateId={template.id} templateName={template.name} archived={template.status === "archived"} companies={without} />
      </div>
    </div>
  );
}
