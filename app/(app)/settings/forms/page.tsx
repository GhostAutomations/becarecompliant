import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import BackLink from "@/components/back-link";
import { listCompanyForms } from "@/lib/form-builder/data";
import NewFormButton from "@/components/form-builder/new-form-button";
import type { FormSummary } from "@/lib/form-builder/types";

export const metadata: Metadata = { title: "Forms" };

const POP_LABEL: Record<string, string> = {
  people: "People",
  service_users: "Service Users",
};

export default async function SettingsFormsPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  const forms = await listCompanyForms(profile.company_id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <BackLink href="/settings" label="Back to Settings" />
        <h1 className="page-title mt-1">Forms</h1>
        <p className="page-subtitle">
          Build and edit the forms your team completes as compliance Evidence. Editing a
          published form creates a new draft; publishing it never changes past Evidence.
        </p>
      </div>

      <div className="flex justify-end">
        <NewFormButton forms={forms} />
      </div>

      {forms.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-white/70">No forms yet.</p>
          <p className="mt-1 text-sm text-white/50">
            Create your first form, or duplicate one of your seeded starter forms.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <FormGroup title="People forms" forms={forms.filter((f) => f.population === "people")} />
          <FormGroup
            title="Service User forms"
            forms={forms.filter((f) => f.population === "service_users")}
          />
        </div>
      )}
    </div>
  );
}

function FormGroup({ title, forms }: { title: string; forms: FormSummary[] }) {
  if (forms.length === 0) return null;
  return (
    <details className="glass-card section-card">
      <summary>
        {title} ({forms.length})
      </summary>
      <div className="border-t border-white/10">
        {forms.map((f) => (
          <Link
            key={f.id}
            href={`/settings/forms/${f.id}`}
            className="flex items-center gap-3 border-b border-white/5 px-5 py-2.5 last:border-b-0 hover:bg-white/5"
          >
            <span className="truncate text-sm font-medium text-white">{f.name}</span>
            <span className="truncate text-xs text-white/40">
              {POP_LABEL[f.population]}
              {f.sourceTemplateKey ? " · starter" : " · authored"}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2 text-xs">
              {f.currentVersion == null ? (
                <span className="pill pill-amber">Not published</span>
              ) : (
                <span className="pill pill-green">v{f.currentVersion}</span>
              )}
              {f.hasDraft && <span className="pill pill-amber">Draft</span>}
            </span>
          </Link>
        ))}
      </div>
    </details>
  );
}
