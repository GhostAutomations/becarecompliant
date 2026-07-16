import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import { listCompanyForms } from "@/lib/form-builder/data";
import NewFormButton from "@/components/form-builder/new-form-button";
import type { FormSummary } from "@/lib/form-builder/types";
import { featureEnabled } from "@/lib/billing/tier";

export const metadata: Metadata = { title: "Forms" };

const POP_LABEL: Record<string, string> = {
  people: "People",
  service_users: "Service Users",
  complaints: "Complaints",
};

export default async function SettingsFormsPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  // The form builder is a Pro and above feature (server-side tier gating).
  const canBuild = await featureEnabled(profile.company_id, "form_builder");
  if (!canBuild) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <BackLink href="/settings" label="Back to Settings" />
          <h1 className="page-title mt-1">Forms</h1>
          <p className="page-subtitle">
            Build and edit the forms your team completes as compliance Evidence.
          </p>
        </div>
        <div className="glass-card p-6 text-center">
          <p className="text-sm text-white/70">
            The form builder is available on the Pro plan and above. Your seeded
            starter forms keep working; upgrade to create and edit your own.
          </p>
          <Link href="/settings/billing" className="btn btn-primary mt-4 inline-block">
            View plans
          </Link>
        </div>
      </div>
    );
  }

  const forms = await listCompanyForms(profile.company_id);

  // Forms wired to a compliance check (a register column) get a link icon.
  const supabase = await createClient();
  const { data: checkForms } = await supabase
    .from("check_definitions")
    .select("form_id")
    .eq("company_id", profile.company_id)
    .not("form_id", "is", null);
  const linkedFormIds = new Set(
    ((checkForms as Array<{ form_id: string | null }> | null) ?? [])
      .map((c) => c.form_id)
      .filter((v): v is string => Boolean(v)),
  );

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
          <FormGroup
            title="People forms"
            forms={forms.filter((f) => f.population === "people")}
            linkedFormIds={linkedFormIds}
          />
          <FormGroup
            title="Service User forms"
            forms={forms.filter((f) => f.population === "service_users")}
            linkedFormIds={linkedFormIds}
          />
          <FormGroup
            title="Complaints forms"
            forms={forms.filter((f) => (f.population as string) === "complaints")}
            linkedFormIds={linkedFormIds}
          />
        </div>
      )}
    </div>
  );
}

function LinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-gold-300"
      aria-hidden
    >
      <path d="M9.5 13.5a3 3 0 004.24 0l3-3a3 3 0 10-4.24-4.24l-1 1" />
      <path d="M14.5 10.5a3 3 0 00-4.24 0l-3 3a3 3 0 104.24 4.24l1-1" />
    </svg>
  );
}

function FormGroup({
  title,
  forms,
  linkedFormIds,
}: {
  title: string;
  forms: FormSummary[];
  linkedFormIds: Set<string>;
}) {
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
            {linkedFormIds.has(f.id) ? (
              <span title="Linked to a compliance check">
                <LinkIcon />
              </span>
            ) : null}
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
