import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { listFormTemplates } from "@/lib/form-builder/data";
import TemplateLibrary from "@/components/form-builder/template-library";

export const metadata: Metadata = { title: "Form template library" };

export default async function FounderFormsPage() {
  await requirePlatformAdmin();
  const templates = await listFormTemplates();

  return (
    <div className="w-full space-y-6">
      <div>
        <BackLink href="/founder" label="Back to Founder console" />
        <h1 className="page-title mt-1">Form template library</h1>
        <p className="page-subtitle">
          The master starter forms that seed every new company. Editing a template does
          not change companies that have already seeded their own copy.
        </p>
      </div>

      <TemplateLibrary templates={templates} />
    </div>
  );
}
