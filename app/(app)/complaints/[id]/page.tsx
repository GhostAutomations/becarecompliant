import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import BackLink from "@/components/back-link";
import EditComplaintForm from "@/components/complaints/edit-complaint-form";
import ComplaintForms from "@/components/complaints/complaint-forms";
import ComplaintStatusControl from "@/components/complaints/complaint-status-control";
import InitialResponseButton from "@/components/complaints/initial-response-button";
import { isFormSchema, type Answers, type FormSchema } from "@/lib/form-schema";
import {
  getComplaint,
  getComplaintsConfig,
  listComplaintForms,
  listComplaintEvidence,
  listComplaintResponses,
  listServiceUsersLite,
  listCompanyBranchNames,
  getPublishedFormVersion,
} from "@/lib/complaints/data";
import type { ComplaintRecord } from "@/lib/complaints/types";
import { responseRag, formatUkDate as formatDisplayDate } from "@/lib/complaints/logic";
import { COMPLAINT_STATUS_LABELS, RELATIONSHIP_LABELS } from "@/lib/complaints/types";

export const metadata: Metadata = { title: "Complaint" };

const MANAGE_ROLES = ["company_admin", "manager", "platform_admin"];

function ragPill(rag: string) {
  if (rag === "red") return <span className="pill-red"><span className="pill-dot" /> Overdue</span>;
  if (rag === "amber") return <span className="pill-amber"><span className="pill-dot" /> Due soon</span>;
  if (rag === "green") return <span className="pill-green"><span className="pill-dot" /> On track</span>;
  if (rag === "closed") return <span className="pill-neutral">Resolved</span>;
  return <span className="pill-neutral">No deadline</span>;
}

function DateField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[11px] text-white/45">{label}</p>
      <p className="text-sm text-white/85">{formatDisplayDate(value) || "—"}</p>
    </div>
  );
}

/** The first word of a branch name, lowercased, used to tie a region specific
 *  form (e.g. "newport_complaint_response") to its branch ("Newport"). */
function firstToken(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().split(/\s+/)[0] ?? "";
}

/** The button label for a form: drop a trailing "Form" and, for a branch's own
 *  response form, the leading branch word (so "Cardiff Complaint Response" reads
 *  "Complaint Response" on a Cardiff complaint). The stored form name is unchanged. */
function buttonLabel(name: string, branchToken: string): string {
  let label = name.replace(/\s+Form$/i, "");
  if (branchToken && label.toLowerCase().startsWith(`${branchToken} `)) {
    label = label.slice(branchToken.length + 1);
  }
  return label;
}

/** The value of a select field's option matching a predicate, or null. Lets us set a
 *  dropdown to the form's OWN option value (which can differ between forms, e.g. one
 *  form's "Closed" is another's "Close"), so we never set an invalid option. */
function optionValueFor(
  schema: FormSchema,
  fieldKey: string,
  match: (v: string) => boolean,
): string | null {
  for (const s of schema.sections) {
    for (const f of s.fields) {
      if (f.key === fieldKey) {
        const opts = (f as { options?: Array<{ value?: unknown }> }).options;
        if (Array.isArray(opts)) {
          const found = opts.find((o) => match(String(o.value ?? "")));
          if (found) return String(found.value ?? "");
        }
        return null;
      }
    }
  }
  return null;
}

/** Pre-fill the complaint's known details into a response form. Free text and date
 *  fields are seeded directly; the Region and Status dropdowns are matched to each
 *  form's own option values. Unknown keys are harmless (ignored on submit). */
function buildComplaintPresets(key: string, c: ComplaintRecord, schema: FormSchema): Answers {
  const p: Answers = {};
  const set = (k: string, v: string | null) => {
    if (v) p[k] = v;
  };
  if (key === "complaints_concerns") {
    set("individual_name", c.service_user_name ?? c.complainant_name ?? null);
    set("date_raised", c.date_raised);
    set("date_occurred", c.date_occurred);
    set("describe_complaint", c.details);
  } else {
    // Region response forms (cardiff_/newport_complaint_response and similar).
    set("complaint_reference", `#${c.ref_number}`);
    set("acknowledgement_date", c.date_acknowledged);
    set("investigation_completed", c.investigation_completed);
  }
  // Region dropdown = this complaint's branch, matched to the form's options.
  const branchLower = (c.branch_name ?? "").trim().toLowerCase();
  if (branchLower) {
    set("region", optionValueFor(schema, "region", (v) => v.toLowerCase() === branchLower));
  }
  // Status dropdown = the complaint's status, matched by a distinctive token so it
  // works whether the option reads "Closed" or "Close".
  const needle = c.status === "open" ? "open" : c.status === "in_progress" ? "progress" : "clos";
  set("status", optionValueFor(schema, "status", (v) => v.toLowerCase().includes(needle)));
  // Complaint/Concern + Type dropdowns, captured at log time (values match the form).
  if (c.concern_type) {
    set("complaint_concern_type", optionValueFor(schema, "complaint_concern_type", (v) => v === c.concern_type));
  }
  if (c.formality) {
    set("type", optionValueFor(schema, "type", (v) => v === c.formality));
  }
  return p;
}

export default async function ComplaintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ logged?: string }>;
}) {
  const { user, profile } = await requireCompany();
  const { id } = await params;
  const { logged } = await searchParams;
  if (!profile.company_id || !MANAGE_ROLES.includes(profile.role)) redirect("/complaints");

  const complaint = await getComplaint(id);
  if (!complaint) redirect("/complaints");
  const companyId = profile.company_id;

  // GDPR (special-category data): audit the READ, not just writes. Best-effort.
  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "complaint.viewed",
    entityType: "complaint",
    entityId: id,
    summary: `Viewed complaint: ${complaint.subject}`,
  });

  const [config, forms, evidence, responses, serviceUsers, branchNames] = await Promise.all([
    getComplaintsConfig(companyId),
    listComplaintForms(companyId),
    listComplaintEvidence(id),
    listComplaintResponses(id),
    listServiceUsersLite(companyId),
    listCompanyBranchNames(companyId),
  ]);

  // Hide region specific forms that belong to a DIFFERENT branch: on a Cardiff
  // complaint, drop "newport_complaint_response" but keep the general form and the
  // Cardiff one. A form is "another branch's" when its key starts with that branch's
  // name token.
  const currentToken = firstToken(complaint.branch_name);
  const otherTokens = branchNames
    .map(firstToken)
    .filter((t) => t && t !== currentToken);

  // Which forms have already been completed as evidence (so their button turns green).
  const evidenceFormIds = new Set(evidence.map((e) => e.form_id));
  const completedFormKeys = new Set(forms.filter((f) => evidenceFormIds.has(f.id)).map((f) => f.key));

  // Pin each complaint form's published schema for the Evidence dialogs, filtered to
  // this branch, and pre-filled from the complaint's details.
  const formSchemas = await Promise.all(
    forms
      .filter((f) => !otherTokens.some((t) => f.key.toLowerCase().startsWith(`${t}_`)))
      .map(async (f) => {
        const version = await getPublishedFormVersion(f.id);
        return version && isFormSchema(version.schema)
          ? {
              key: f.key,
              name: f.name,
              label: buttonLabel(f.name, currentToken),
              done: completedFormKeys.has(f.key),
              schema: version.schema as FormSchema,
              presets: buildComplaintPresets(f.key, complaint, version.schema as FormSchema),
            }
          : null;
      }),
  );
  const usableForms = formSchemas
    .filter(
      (f): f is { key: string; name: string; label: string; done: boolean; schema: FormSchema; presets: Answers } => f != null,
    )
    // Complaint Investigation sits first among the forms so, next to the Initial
    // Response button, it lands in the middle of the row; region forms follow.
    .sort((a, b) =>
      a.key === "complaints_concerns" ? -1 : b.key === "complaints_concerns" ? 1 : a.name.localeCompare(b.name),
    );

  const rag = responseRag(complaint.status, complaint.response_due, config.amber_days);

  // One Evidence history combining completed forms and recorded responses, newest first.
  const historyRows = [
    ...evidence.map((e) => ({
      key: `e-${e.id}`,
      date: e.submitted_at,
      title: e.form_name ?? "Evidence",
      person: e.author_name ?? "Unknown",
      href: `/evidence/${e.id}`,
    })),
    ...responses.map((r) => ({
      key: `r-${r.id}`,
      date: r.created_at,
      title: r.method === "email" ? "Initial response (email)" : "Initial response (letter)",
      person: r.author_name ?? "Unknown",
      href: `/complaints/${complaint.id}/responses/${r.id}`,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <BackLink href="/complaints" label="Back to Complaints" />
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="page-title">Complaint #{complaint.ref_number}</h1>
          <span className={complaint.status === "closed" ? "pill-green" : complaint.status === "in_progress" ? "pill-amber" : "pill-neutral"}>
            {COMPLAINT_STATUS_LABELS[complaint.status]}
          </span>
          {ragPill(rag)}
        </div>
        <p className="page-subtitle mt-1">
          {[complaint.subject, complaint.branch_name].filter(Boolean).join(" · ")}
        </p>
      </div>

      {logged ? (
        <div className="glass-card border border-rag-green/20 p-4 text-sm text-rag-green-soft">
          Form saved as complaint evidence.
        </div>
      ) : null}

      {/* Case detail */}
      <section className="glass-card space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Case detail</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[11px] text-white/45">Complainant</p>
            <p className="text-sm text-white/85">{complaint.complainant_name || "Not named"}</p>
            {complaint.complainant_relationship ? (
              <p className="text-[11px] text-white/45">{RELATIONSHIP_LABELS[complaint.complainant_relationship]}</p>
            ) : null}
          </div>
          <div>
            <p className="text-[11px] text-white/45">Related service user</p>
            <p className="text-sm text-white/85">
              {complaint.service_user_id ? (
                <Link href={`/service-users/${complaint.service_user_id}`} className="text-gold-300 hover:underline">
                  {complaint.service_user_name ?? "View record"}
                </Link>
              ) : (
                "None"
              )}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-white/45">Complaint/Concern</p>
            <p className="text-sm text-white/85">{complaint.concern_type ?? "—"}</p>
          </div>
          <div>
            <p className="text-[11px] text-white/45">Type</p>
            <p className="text-sm text-white/85">{complaint.formality ?? "—"}</p>
          </div>
          <div>
            <p className="text-[11px] text-white/45">Preferred contact</p>
            <p className="text-sm text-white/85">
              {complaint.contact_method === "email" ? "Email" : complaint.contact_method === "post" ? "Post" : "—"}
            </p>
          </div>
          <DateField label="Date raised" value={complaint.date_raised} />
          <DateField label="Date it happened" value={complaint.date_occurred} />
          <DateField label="Initial response due" value={complaint.acknowledgement_due} />
          <div>
            <p className="text-[11px] text-white/45">Initial response sent</p>
            {complaint.date_acknowledged ? (
              <p className="mt-0.5">
                <span className="pill-green">{formatDisplayDate(complaint.date_acknowledged)}</span>
              </p>
            ) : (
              <p className="text-sm text-white/85">—</p>
            )}
          </div>
          <DateField label="Investigation completed" value={complaint.investigation_completed} />
          <DateField label="Response due" value={complaint.response_due} />
          <DateField label="Closed" value={complaint.date_closed} />
        </div>
        {complaint.details ? (
          <div>
            <p className="text-[11px] text-white/45">Details</p>
            <p className="whitespace-pre-wrap text-sm text-white/80">{complaint.details}</p>
          </div>
        ) : null}
        {complaint.status === "closed" && complaint.outcome ? (
          <div>
            <p className="text-[11px] text-white/45">Outcome</p>
            <p className="whitespace-pre-wrap text-sm text-white/80">{complaint.outcome}</p>
          </div>
        ) : null}
      </section>

      {/* Complaint forms as Evidence */}
      <section className="glass-card space-y-3 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Response and investigation forms
        </h2>
        <p className="text-xs text-white/50">
          Generate an initial response, or complete a form. Both are stored against this complaint.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <InitialResponseButton
            complaintId={complaint.id}
            contactMethod={complaint.contact_method}
            contactEmail={complaint.contact_email}
            contactAddress={complaint.contact_address}
            done={responses.length > 0}
          />
          <ComplaintForms complaintId={complaint.id} forms={usableForms} />
        </div>
      </section>

      {/* Status control */}
      <section className="glass-card space-y-3 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Progress</h2>
        <ComplaintStatusControl
          complaintId={complaint.id}
          status={complaint.status}
          outcome={complaint.outcome}
        />
      </section>

      {/* Evidence history (completed forms + recorded responses) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Evidence history</h2>
        {historyRows.length === 0 ? (
          <div className="glass-card p-6 text-sm text-white/60">
            No evidence yet. A recorded response or a completed complaint form is stored here as
            immutable inspection evidence.
          </div>
        ) : (
          <div className="glass-card divide-y divide-white/5">
            {historyRows.map((h) => (
              <div key={h.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="w-24 shrink-0 text-white/50">{formatDisplayDate(h.date.slice(0, 10))}</span>
                  <span className="text-white/50">{h.title}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="w-40 text-right text-white/50">{h.person}</span>
                  <a href={h.href} className="btn-outline px-2.5 py-1 text-[11px]">View</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Edit */}
      <details className="glass-card section-card">
        <summary>Edit complaint</summary>
        <div className="border-t border-white/10 p-5">
          <EditComplaintForm complaint={complaint} serviceUsers={serviceUsers} />
        </div>
      </details>
    </div>
  );
}
