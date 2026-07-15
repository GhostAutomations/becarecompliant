import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import BackLink from "@/components/back-link";
import ActionForm from "@/components/action-form";
import ComplaintForms from "@/components/complaints/complaint-forms";
import ComplaintStatusControl from "@/components/complaints/complaint-status-control";
import { isFormSchema, type Answers, type FormSchema } from "@/lib/form-schema";
import {
  getComplaint,
  getComplaintsConfig,
  listComplaintForms,
  listComplaintEvidence,
  listServiceUsersLite,
  listCompanyBranchNames,
  getPublishedFormVersion,
} from "@/lib/complaints/data";
import type { ComplaintRecord } from "@/lib/complaints/types";
import { updateComplaint } from "@/lib/complaints/actions";
import { responseRag, formatDisplayDate } from "@/lib/complaints/logic";
import {
  COMPLAINT_STATUS_LABELS,
  RELATIONSHIP_LABELS,
  CONCERN_TYPES,
  FORMALITY_TYPES,
  CONTACT_METHODS,
  type ComplaintRelationship,
} from "@/lib/complaints/types";

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

  const [config, forms, evidence, serviceUsers, branchNames] = await Promise.all([
    getComplaintsConfig(companyId),
    listComplaintForms(companyId),
    listComplaintEvidence(id),
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
              schema: version.schema as FormSchema,
              presets: buildComplaintPresets(f.key, complaint, version.schema as FormSchema),
            }
          : null;
      }),
  );
  const usableForms = formSchemas.filter(
    (f): f is { key: string; name: string; schema: FormSchema; presets: Answers } => f != null,
  );

  const rag = responseRag(complaint.status, complaint.response_due, config.amber_days);

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
              {complaint.contact_method === "email"
                ? `Email: ${complaint.contact_email ?? "—"}`
                : complaint.contact_method === "post"
                  ? `Post: ${complaint.contact_address ?? "—"}`
                  : "—"}
            </p>
          </div>
          <DateField label="Date raised" value={complaint.date_raised} />
          <DateField label="Date it happened" value={complaint.date_occurred} />
          <DateField label="Acknowledged" value={complaint.date_acknowledged} />
          <DateField label="Acknowledgement due" value={complaint.acknowledgement_due} />
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
          Completing a form stores it as immutable evidence against this complaint.
        </p>
        <ComplaintForms complaintId={complaint.id} forms={usableForms} />
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

      {/* Evidence history */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Evidence history</h2>
        {evidence.length === 0 ? (
          <div className="glass-card p-6 text-sm text-white/60">
            No evidence yet. Completing a complaint form stores it here as immutable inspection evidence.
          </div>
        ) : (
          <div className="glass-card divide-y divide-white/5">
            {evidence.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="text-white/85">{formatDisplayDate(e.submitted_at.slice(0, 10))}</span>
                <span className="flex items-center gap-3">
                  <span className="text-white/50">{e.author_name ?? "Unknown"}</span>
                  <a href={`/evidence/${e.id}`} className="btn-outline px-2.5 py-1 text-[11px]">View</a>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Edit */}
      <details className="glass-card section-card">
        <summary>Edit complaint</summary>
        <div className="border-t border-white/10 p-5">
          <ActionForm action={updateComplaint} hidden={{ complaint_id: complaint.id }} label="Save changes">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="subject" className="form-label">Subject</label>
                <input id="subject" name="subject" defaultValue={complaint.subject} required />
              </div>
              <div>
                <label htmlFor="complainant_name" className="form-label">Complainant name</label>
                <input id="complainant_name" name="complainant_name" defaultValue={complaint.complainant_name ?? ""} />
              </div>
              <div>
                <label htmlFor="complainant_relationship" className="form-label">Complainant is a</label>
                <select id="complainant_relationship" name="complainant_relationship" defaultValue={complaint.complainant_relationship ?? ""}>
                  <option value="">Not stated</option>
                  {(Object.keys(RELATIONSHIP_LABELS) as ComplaintRelationship[]).map((k) => (
                    <option key={k} value={k}>{RELATIONSHIP_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="service_user_id" className="form-label">Related service user</label>
                <select id="service_user_id" name="service_user_id" defaultValue={complaint.service_user_id ?? ""}>
                  <option value="">None</option>
                  {serviceUsers.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="concern_type" className="form-label">Complaint/Concern</label>
                <select id="concern_type" name="concern_type" defaultValue={complaint.concern_type ?? ""}>
                  <option value="">Not set</option>
                  {CONCERN_TYPES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="formality" className="form-label">Type</label>
                <select id="formality" name="formality" defaultValue={complaint.formality ?? ""}>
                  <option value="">Not set</option>
                  {FORMALITY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="contact_method" className="form-label">Preferred contact method</label>
                <select id="contact_method" name="contact_method" defaultValue={complaint.contact_method ?? ""}>
                  <option value="">Not stated</option>
                  {CONTACT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="contact_email" className="form-label">Contact email</label>
                <input id="contact_email" name="contact_email" type="email" defaultValue={complaint.contact_email ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="contact_address" className="form-label">Contact address</label>
                <textarea id="contact_address" name="contact_address" rows={2} defaultValue={complaint.contact_address ?? ""} />
              </div>
              <div>
                <label htmlFor="date_occurred" className="form-label">Date it happened</label>
                <input id="date_occurred" name="date_occurred" type="date" defaultValue={complaint.date_occurred ?? ""} />
              </div>
              <div>
                <label htmlFor="date_acknowledged" className="form-label">Acknowledged</label>
                <input id="date_acknowledged" name="date_acknowledged" type="date" defaultValue={complaint.date_acknowledged ?? ""} />
              </div>
              <div>
                <label htmlFor="acknowledgement_due" className="form-label">Acknowledgement due</label>
                <input id="acknowledgement_due" name="acknowledgement_due" type="date" defaultValue={complaint.acknowledgement_due ?? ""} />
              </div>
              <div>
                <label htmlFor="investigation_completed" className="form-label">Investigation completed</label>
                <input id="investigation_completed" name="investigation_completed" type="date" defaultValue={complaint.investigation_completed ?? ""} />
              </div>
              <div>
                <label htmlFor="response_due" className="form-label">Response due</label>
                <input id="response_due" name="response_due" type="date" defaultValue={complaint.response_due ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="details" className="form-label">Details</label>
                <textarea id="details" name="details" rows={4} defaultValue={complaint.details ?? ""} />
              </div>
            </div>
          </ActionForm>
        </div>
      </details>
    </div>
  );
}
