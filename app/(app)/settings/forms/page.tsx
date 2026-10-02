import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompanyAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import BackLink from "@/components/back-link";
import { listCompanyForms } from "@/lib/form-builder/data";
import NewFormButton from "@/components/form-builder/new-form-button";
import FormColumnLink, { type ColumnChoice } from "@/components/form-builder/form-column-link";
import type { FormSummary } from "@/lib/form-builder/types";
import { featureEnabled } from "@/lib/billing/tier";
import { departmentFor } from "@/lib/form-builder/department-forms";
import FormsLeaveCheck from "@/components/setup/forms-leave-check";

export const metadata: Metadata = { title: "Forms" };

const POP_LABEL: Record<string, string> = {
  people: "People",
  service_users: "Service Users",
  complaints: "Complaints",
  incidents: "Incidents",
};

export default async function SettingsFormsPage() {
  const { profile } = await requireCompanyAdmin();
  if (!profile.company_id) redirect("/founder");

  // The form builder is a Pro and above feature (server-side tier gating).
  const canBuild = await featureEnabled(profile.company_id, "form_builder");
  /* BUSINESS SEES ITS FORMS, READ ONLY (Phil, 2026-10-01). The builder is Pro and above, but
     Be Care Compliant builds a customer's forms for them, so a Business Admin still looks them
     over and is asked on leaving whether they are happy. No editing, no column dropdowns. */
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

  const peopleChecks: ColumnChoice[] = [];
  const suChecks: ColumnChoice[] = [];
  const formLinkedCheck = new Map<string, string>();
  /* Which form each column uses now, by name, so the dropdown can say what a change would undo
     (DEF-108, 2 Oct 2026). */
  const formName = new Map(forms.map((f) => [f.id, f.name]));
  for (const c of (checkDefs as Array<{ id: string; name: string; population: string; form_id: string | null }> | null) ?? []) {
    (c.population === "service_users" ? suChecks : peopleChecks).push({
      id: c.id,
      name: c.name,
      formId: c.form_id,
      formName: c.form_id ? (formName.get(c.form_id) ?? "another form") : null,
    });
    if (c.form_id) formLinkedCheck.set(c.form_id, c.id);
  }

  /* The "happy with your forms?" question on leaving (Phil, 2026-10-01): only for the Company
     Admin, and only while the Getting set up step is still open. */
  const { data: formsStep } = await supabase
    .from("company_setup_steps")
    .select("state")
    .eq("company_id", profile.company_id)
    .eq("step_key", "forms")
    .maybeSingle();
  const askOnLeave = profile.role === "company_admin" && !formsStep;

  const byName = (a: FormSummary, b: FormSummary) =>
    a.name.localeCompare(b.name) || (POP_LABEL[a.population] ?? "").localeCompare(POP_LABEL[b.population] ?? "");
  const departmentForms = forms.filter((f) => departmentFor(f) !== null).sort(byName);
  const checkForms = forms.filter((f) => departmentFor(f) === null).sort(byName);

  return (
    <div className="page-shell space-y-6">
      {askOnLeave ? <FormsLeaveCheck /> : null}
      <div>
        <BackLink href="/settings" label="Back to Settings" />
        <h1 className="page-title mt-1">Forms</h1>
        <p className="page-subtitle">
          Build and edit the forms your team completes as compliance Evidence. Editing a
          published form creates a new draft; publishing it never changes past Evidence.
        </p>
      </div>

      {canBuild ? (
        <div className="flex justify-end">
          <NewFormButton forms={forms} />
        </div>
      ) : (
        <div className="glass-card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-white/70">
            These are your forms, to look over. Editing them and building your own is on the Pro
            plan and above. If something needs changing, tell us as you leave this page.
          </p>
          <Link href="/settings/billing" className="btn-outline px-3 py-1.5 text-xs">
            View plans
          </Link>
        </div>
      )}

      {forms.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-white/70">No forms yet.</p>
          <p className="mt-1 text-sm text-white/50">
            Create your first form, or duplicate one of your seeded starter forms.
          </p>
        </div>
      ) : (
        /* TWO TILES (Phil, 2026-10-01: "there needs to be a better simpler way"). Check forms
           complete a check on the People or Service User register and keep their column
           dropdown; Department forms are what a department runs on and say where in text.
           Every form appears once, A to Z. Side by side on a wide screen. */
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <FormGroup
            title="Check forms"
            forms={checkForms}
            checksFor={(f) => (f.population === "service_users" ? suChecks : peopleChecks)}
            formLinkedCheck={formLinkedCheck}
            readOnly={!canBuild}
          />
          <FormGroup
            title="Department forms"
            forms={departmentForms}
            checksFor={() => []}
            formLinkedCheck={formLinkedCheck}
            labelFor={(f) => departmentFor(f)}
            readOnly={!canBuild}
          />
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
  sectionLabel,
  summaryOnly = false,
  readOnly = false,
}: {
  f: FormSummary;
  checks: ColumnChoice[];
  formLinkedCheck: Map<string, string>;
  sectionLabel: string | null;
  /** Linked forms is a SUMMARY (Phil, 2026-10-01): it says what each form links to, and the
   *  link is changed in the form's own section, not here. */
  summaryOnly?: boolean;
  readOnly?: boolean;
}) {
  const linkedCheckId = formLinkedCheck.get(f.id);
  const linkedName = linkedCheckId ? checks.find((c) => c.id === linkedCheckId)?.name ?? null : null;
  const linkLabel = checks.length > 0 ? linkedName : sectionLabel;
  /* FIXED COLUMNS (Phil, 2026-10-01): "put the drop downs in a line not dependent on the icons
     to their right". Every row keeps the same slots whether or not it has a dropdown, a link
     icon or a shield, so the dropdowns, icons and versions each line up down the list. */
  return (
    <div className="flex items-center gap-3 border-b border-white/5 px-5 py-2.5 last:border-b-0 hover:bg-white/5">
      {readOnly ? (
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className="truncate text-sm font-medium text-white">{f.name}</span>
          <span className="truncate text-xs text-white/40">{POP_LABEL[f.population]}</span>
        </span>
      ) : (
        <Link href={`/settings/forms/${f.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <span className="truncate text-sm font-medium text-white">{f.name}</span>
          <span className="truncate text-xs text-white/40">{POP_LABEL[f.population]}</span>
        </Link>
      )}
      <span className="w-44 shrink-0">
        {summaryOnly ? (
          linkLabel ? <span className="block truncate text-xs text-white/60">{linkLabel}</span> : null
        ) : checks.length > 0 ? (
          <FormColumnLink formId={f.id} formName={f.name} checks={checks} currentCheckId={linkedCheckId ?? ""} />
        ) : null}
      </span>
      <span className="flex w-10 shrink-0 items-center justify-end gap-1.5">
        <span className="inline-flex w-4 justify-center">
          {linkLabel ? (
            <span className="group relative inline-flex">
              <LinkIcon />
              <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-1.5 hidden whitespace-nowrap rounded-md border border-white/10 bg-navy-950 px-2 py-1 text-[11px] text-white/90 shadow-lg group-hover:block">
                Links to {linkLabel}
              </span>
            </span>
          ) : null}
        </span>
        <span className="inline-flex w-4 justify-center">
          {f.sourceTemplateKey ? (
            <span className="group relative inline-flex">
              <ShieldIcon />
              <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-1.5 hidden whitespace-nowrap rounded-md border border-white/10 bg-navy-950 px-2 py-1 text-[11px] text-white/90 shadow-lg group-hover:block">
                Be Care Compliant form
              </span>
            </span>
          ) : null}
        </span>
      </span>
      <span className="flex w-28 shrink-0 items-center justify-end gap-2 text-xs">
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
  checksFor,
  formLinkedCheck,
  labelFor,
  readOnly = false,
}: {
  title: string;
  forms: FormSummary[];
  checksFor: (f: FormSummary) => ColumnChoice[];
  formLinkedCheck: Map<string, string>;
  /** Department forms: where the form is used, shown as text in place of a dropdown. */
  labelFor?: (f: FormSummary) => string | null;
  /** Business: look, do not touch (no link into the builder, no dropdown). */
  readOnly?: boolean;
}) {
  if (forms.length === 0) return null;
  return (
    <details className="glass-card section-card">
      <summary>
        {title} ({forms.length})
      </summary>
      <div className="border-t border-white/10">
        {forms.map((f) => (
          <FormRow
            key={f.id}
            f={f}
            checks={checksFor(f)}
            formLinkedCheck={formLinkedCheck}
            sectionLabel={labelFor ? labelFor(f) : null}
            summaryOnly={Boolean(labelFor) || readOnly}
            readOnly={readOnly}
          />
        ))}
      </div>
    </details>
  );
}
