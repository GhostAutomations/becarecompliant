import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import { listCompanyForms } from "@/lib/form-builder/data";
import NewFormButton from "@/components/form-builder/new-form-button";
import FormColumnLink from "@/components/form-builder/form-column-link";
import type { FormSummary } from "@/lib/form-builder/types";
import { featureEnabled } from "@/lib/billing/tier";

export const metadata: Metadata = { title: "Forms" };

const POP_LABEL: Record<string, string> = {
  people: "People",
  service_users: "Service Users",
  complaints: "Complaints",
};

// People forms are grouped by sub-department (mirrors the People nav children).
// Anything not explicitly mapped falls under Compliance.
const PEOPLE_SUBDEPT: Record<string, string> = {
  holiday_requests: "Holiday",
  holiday_response: "Holiday",
  absence_back_office: "Absence",
  absence_management_meeting: "Absence",
  training_request: "Training",
};
function peopleSubDept(key: string): string {
  return PEOPLE_SUBDEPT[key] ?? "Compliance";
}

/** Forms that link to a whole section/feature rather than a register column
 *  (Holiday, Absence, Training, Complaints). Compliance and Service User forms
 *  link to a column instead, so they return null. */
function sectionLabelFor(f: FormSummary): string | null {
  if ((f.population as string) === "complaints") return "Complaints section";
  if (f.population === "people") {
    const sub = peopleSubDept(f.key);
    if (sub === "Holiday" || sub === "Absence" || sub === "Training") return sub;
  }
  return null;
}

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

  // The department columns (compliance checks) a form can link to, and which check
  // each form is currently wired to.
  const supabase = await createClient();
  const { data: checkDefs } = await supabase
    .from("check_definitions")
    .select("id, name, population, form_id")
    .eq("company_id", profile.company_id)
    .eq("active", true)
    .in("population", ["people", "service_users"])
    .order("sort_order", { ascending: true });

  const peopleChecks: Array<{ id: string; name: string }> = [];
  const suChecks: Array<{ id: string; name: string }> = [];
  const formLinkedCheck = new Map<string, string>();
  for (const c of (checkDefs as Array<{ id: string; name: string; population: string; form_id: string | null }> | null) ?? []) {
    (c.population === "service_users" ? suChecks : peopleChecks).push({ id: c.id, name: c.name });
    if (c.form_id) formLinkedCheck.set(c.form_id, c.id);
  }

  const peopleForms = forms.filter((f) => f.population === "people");
  const suForms = forms.filter((f) => f.population === "service_users");
  const complaintForms = forms.filter((f) => (f.population as string) === "complaints");
  const peopleBySub = (sub: string) => peopleForms.filter((f) => peopleSubDept(f.key) === sub);
  // Forms wired to a column (People/Service User) or the Complaints section, duplicated
  // into their own aggregate section.
  const linkedForms = forms.filter(
    (f) => formLinkedCheck.has(f.id) || sectionLabelFor(f) !== null,
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
          <LinkedFormsGroup
            forms={linkedForms}
            peopleChecks={peopleChecks}
            suChecks={suChecks}
            formLinkedCheck={formLinkedCheck}
          />
          <FormGroup title="People forms" forms={peopleBySub("Compliance")} checks={peopleChecks} formLinkedCheck={formLinkedCheck} />
          <FormGroup title="Holiday forms" forms={peopleBySub("Holiday")} checks={[]} formLinkedCheck={formLinkedCheck} sectionLabel="Holiday" />
          <FormGroup title="Absence forms" forms={peopleBySub("Absence")} checks={[]} formLinkedCheck={formLinkedCheck} sectionLabel="Absence" />
          <FormGroup title="Training forms" forms={peopleBySub("Training")} checks={[]} formLinkedCheck={formLinkedCheck} sectionLabel="Training" />
          <FormGroup title="Service User forms" forms={suForms} checks={suChecks} formLinkedCheck={formLinkedCheck} />
          <FormGroup title="Complaints forms" forms={complaintForms} checks={[]} formLinkedCheck={formLinkedCheck} sectionLabel="Complaints section" />
        </div>
      )}
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#f59e0b"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden
    >
      <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
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

function FormRow({
  f,
  checks,
  formLinkedCheck,
  isComplaints,
}: {
  f: FormSummary;
  checks: Array<{ id: string; name: string }>;
  formLinkedCheck: Map<string, string>;
  sectionLabel: string | null;
}) {
  const linkedCheckId = formLinkedCheck.get(f.id);
  const linkedName = linkedCheckId ? checks.find((c) => c.id === linkedCheckId)?.name ?? null : null;
  const linkLabel = checks.length > 0 ? linkedName : sectionLabel;
  return (
    <div className="flex items-center gap-3 border-b border-white/5 px-5 py-2.5 last:border-b-0 hover:bg-white/5">
      <Link href={`/settings/forms/${f.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="truncate text-sm font-medium text-white">{f.name}</span>
        <span className="truncate text-xs text-white/40">{POP_LABEL[f.population]}</span>
      </Link>
      {checks.length > 0 ? (
        <FormColumnLink formId={f.id} checks={checks} currentCheckId={linkedCheckId ?? ""} />
      ) : null}
      {linkLabel ? (
        <span className="group relative inline-flex shrink-0">
          <LinkIcon />
          <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-1.5 hidden whitespace-nowrap rounded-md border border-white/10 bg-navy-950 px-2 py-1 text-[11px] text-white/90 shadow-lg group-hover:block">
            Links to {linkLabel}
          </span>
        </span>
      ) : null}
      {f.sourceTemplateKey ? (
        <span className="group relative inline-flex shrink-0">
          <ShieldIcon />
          <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-1.5 hidden whitespace-nowrap rounded-md border border-white/10 bg-navy-950 px-2 py-1 text-[11px] text-white/90 shadow-lg group-hover:block">
            Be Care Compliant form
          </span>
        </span>
      ) : null}
      <span className="flex shrink-0 items-center gap-2 text-xs">
        {f.currentVersion == null ? (
          <span className="pill pill-amber">Not published</span>
        ) : (
          <span className="pill pill-green">v{f.currentVersion}</span>
        )}
        {f.hasDraft && <span className="pill pill-amber">Draft</span>}
      </span>
    </div>
  );
}

function FormGroup({
  title,
  forms,
  checks,
  formLinkedCheck,
  sectionLabel = null,
}: {
  title: string;
  forms: FormSummary[];
  checks: Array<{ id: string; name: string }>;
  formLinkedCheck: Map<string, string>;
  sectionLabel?: string | null;
}) {
  if (forms.length === 0) return null;
  return (
    <details className="glass-card section-card">
      <summary>
        {title} ({forms.length})
      </summary>
      <div className="border-t border-white/10">
        {forms.map((f) => (
          <FormRow key={f.id} f={f} checks={checks} formLinkedCheck={formLinkedCheck} sectionLabel={sectionLabel} />
        ))}
      </div>
    </details>
  );
}

/** Aggregate section: every form wired to a column or a section, using the right
 *  column dropdown per population. These forms also appear in their own
 *  department/sub-department section. */
function LinkedFormsGroup({
  forms,
  peopleChecks,
  suChecks,
  formLinkedCheck,
}: {
  forms: FormSummary[];
  peopleChecks: Array<{ id: string; name: string }>;
  suChecks: Array<{ id: string; name: string }>;
  formLinkedCheck: Map<string, string>;
}) {
  if (forms.length === 0) return null;
  return (
    <details className="glass-card section-card">
      <summary>
        Linked forms ({forms.length})
      </summary>
      <div className="border-t border-white/10">
        {forms.map((f) => {
          const sectionLabel = sectionLabelFor(f);
          const checks = sectionLabel
            ? []
            : f.population === "people"
              ? peopleChecks
              : f.population === "service_users"
                ? suChecks
                : [];
          return (
            <FormRow
              key={f.id}
              f={f}
              checks={checks}
              formLinkedCheck={formLinkedCheck}
              sectionLabel={sectionLabel}
            />
          );
        })}
      </div>
    </details>
  );
}
