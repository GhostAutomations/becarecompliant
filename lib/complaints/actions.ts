"use server";

/**
 * Be Care Compliant — Complaints (Phase 10 Additions) server actions.
 *
 * A complaint is a lifecycle case (Open / In Progress / Closed), not a recurring
 * check. Complaint forms are completed as immutable Evidence through the SAME
 * pipeline as everything else (submitEvidence, record_type = 'complaint'). RLS
 * (is_company_admin / is_branch_manager) is the real guard; the role checks here
 * give a clean message before the database refuses.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { submitEvidence } from "@/lib/evidence/submit";
import { requireFeature } from "@/lib/billing/tier";
import { recordUsage } from "@/lib/notifications/usage";
import { sendEmail } from "@/lib/email/resend";
import { noticeEmailHtml, escapeHtml } from "@/lib/email/templates";
import type { Answers } from "@/lib/form-schema";
import type { ActionState } from "@/lib/forms";
import { getComplaintsConfig, getCompanyFormByKey } from "./data";
import { addBusinessOrCalendarDays, formatDisplayDate, isFormalComplaint, todayIso } from "./logic";
import { CONCERN_TYPES, FORMALITY_TYPES, RELATIONSHIP_LABELS, type ComplaintRelationship } from "./types";

const MANAGE_ROLES = ["company_admin", "manager", "platform_admin"];

/** Parse the log-time intake fields (Complaint/Concern, Type, contact method) into a
 *  validated shape shared by create and update. */
function intakeFields(formData: FormData) {
  const concernRaw = String(formData.get("concern_type") ?? "").trim();
  const formalityRaw = String(formData.get("formality") ?? "").trim();
  const methodRaw = String(formData.get("contact_method") ?? "").trim();
  const contact_method = methodRaw === "email" || methodRaw === "post" ? methodRaw : null;
  return {
    concern_type: (CONCERN_TYPES as readonly string[]).includes(concernRaw) ? concernRaw : null,
    formality: (FORMALITY_TYPES as readonly string[]).includes(formalityRaw) ? formalityRaw : null,
    contact_method,
    contact_email: contact_method === "email" ? (String(formData.get("contact_email") ?? "").trim() || null) : null,
    contact_address: contact_method === "post" ? (String(formData.get("contact_address") ?? "").trim() || null) : null,
  };
}

function trimOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function isoDateOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

const RELATIONSHIPS = ["service_user", "relative", "staff", "professional", "public", "anonymous"];

/** Log a complaint. The acknowledgement and response due dates default from the
 *  company timescales (cited CQC/CIW norms), and stay editable on the record. */
export async function createComplaint(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (!MANAGE_ROLES.includes(profile.role)) return { error: "You do not have permission to log complaints." };
  const companyId = profile.company_id;

  const subject = String(formData.get("subject") ?? "").trim();
  const branch_id = String(formData.get("branch_id") ?? "").trim();
  if (!subject) return { error: "Enter a short subject for the complaint." };
  if (!branch_id) return { error: "Choose a branch." };

  const date_raised = isoDateOrNull(formData.get("date_raised")) ?? todayIso();
  const relationship = trimOrNull(formData.get("complainant_relationship"));
  const config = await getComplaintsConfig(companyId);
  const intake = intakeFields(formData);
  // All complaints are acknowledged; only formal complaints get a response deadline.
  const formal = isFormalComplaint(intake.concern_type, intake.formality);

  const supabase = await createClient();
  const { data: complaint, error } = await supabase
    .from("complaints")
    .insert({
      company_id: companyId,
      branch_id,
      subject,
      details: trimOrNull(formData.get("details")),
      complainant_name: trimOrNull(formData.get("complainant_name")),
      complainant_relationship: relationship && RELATIONSHIPS.includes(relationship) ? relationship : null,
      ...intake,
      service_user_id: trimOrNull(formData.get("service_user_id")),
      date_raised,
      date_occurred: isoDateOrNull(formData.get("date_occurred")),
      acknowledgement_due: addBusinessOrCalendarDays(date_raised, config.acknowledgement_days, config.count_working_days),
      response_due: formal
        ? addBusinessOrCalendarDays(date_raised, config.response_days, config.count_working_days)
        : null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "complaint.created",
    entityType: "complaint",
    entityId: complaint.id,
    summary: `Logged complaint: ${subject}`,
    metadata: { branch_id },
  });

  redirect(`/complaints/${complaint.id}`);
}

/** Edit a complaint's detail fields and lifecycle dates. */
export async function updateComplaint(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("complaint_id") ?? "");
  if (!id || !profile.company_id) return { error: "Missing complaint." };

  const subject = String(formData.get("subject") ?? "").trim();
  if (!subject) return { error: "Enter a short subject for the complaint." };
  const relationship = trimOrNull(formData.get("complainant_relationship"));

  const supabase = await createClient();
  const intake = intakeFields(formData);
  const formal = isFormalComplaint(intake.concern_type, intake.formality);

  // Response deadline only exists for formal complaints. If it becomes formal without
  // one, derive it from the raised date; if it stops being formal, clear it.
  let responseDue = isoDateOrNull(formData.get("response_due"));
  if (!formal) {
    responseDue = null;
  } else if (!responseDue) {
    const [{ data: existing }, config] = await Promise.all([
      supabase.from("complaints").select("date_raised").eq("id", id).maybeSingle(),
      getComplaintsConfig(profile.company_id),
    ]);
    const raised = (existing?.date_raised as string | null) ?? todayIso();
    responseDue = addBusinessOrCalendarDays(raised, config.response_days, config.count_working_days);
  }

  const { data, error } = await supabase
    .from("complaints")
    .update({
      subject,
      details: trimOrNull(formData.get("details")),
      complainant_name: trimOrNull(formData.get("complainant_name")),
      complainant_relationship: relationship && RELATIONSHIPS.includes(relationship) ? relationship : null,
      ...intake,
      service_user_id: trimOrNull(formData.get("service_user_id")),
      date_occurred: isoDateOrNull(formData.get("date_occurred")),
      date_acknowledged: isoDateOrNull(formData.get("date_acknowledged")),
      acknowledgement_due: isoDateOrNull(formData.get("acknowledgement_due")),
      investigation_completed: isoDateOrNull(formData.get("investigation_completed")),
      response_due: responseDue,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "complaint.updated",
    entityType: "complaint",
    entityId: id,
    summary: `Updated complaint: ${subject}`,
  });

  revalidatePath(`/complaints/${id}`);
  revalidatePath("/complaints");
  return { ok: "Saved." };
}

/** Move a complaint through Open / In Progress / Closed. Closing stamps the close
 *  date and captures the outcome; reopening clears the close date. */
export async function setComplaintStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("complaint_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !profile.company_id) return { error: "Missing complaint." };
  if (!["open", "in_progress", "closed"].includes(status)) return { error: "Choose a valid status." };

  const outcome = status === "closed" ? trimOrNull(formData.get("outcome")) : null;
  const update: Record<string, unknown> = {
    status,
    date_closed: status === "closed" ? todayIso() : null,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  if (status === "closed") update.outcome = outcome;

  const supabase = await createClient();
  const { data, error } = await supabase.from("complaints").update(update).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No change was saved. You may not have permission." };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "complaint.status_changed",
    entityType: "complaint",
    entityId: id,
    summary: `Set complaint status to ${status}`,
    metadata: { status },
  });

  revalidatePath(`/complaints/${id}`);
  revalidatePath("/complaints");
  return { ok: "Saved." };
}

/** Complete one of the complaint forms and store it as immutable Evidence against
 *  the complaint. An Open complaint moves to In Progress on the first response. */
export async function submitComplaintEvidence(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const complaintId = String(formData.get("complaint_id") ?? "");
  const formKey = String(formData.get("form_key") ?? "");
  if (!complaintId || !formKey || !profile.company_id) return { error: "Missing complaint or form." };

  let answers: Answers;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}")) as Answers;
  } catch {
    return { error: "Could not read the form answers." };
  }

  const supabase = await createClient();
  const { data: complaint } = await supabase
    .from("complaints")
    .select("id, branch_id, status")
    .eq("id", complaintId)
    .maybeSingle();
  if (!complaint) return { error: "That complaint could not be found." };

  const form = await getCompanyFormByKey(profile.company_id, formKey);
  if (!form) return { error: "That form is not available. Import the latest templates from Settings." };

  const result = await submitEvidence({
    formVersionId: form.versionId,
    branchId: (complaint.branch_id as string | null) ?? null,
    answers,
    recordType: "complaint",
    recordId: complaintId,
  });
  if (!result.ok) return { error: result.error };

  // First response on an Open complaint moves it to In Progress.
  if (complaint.status === "open") {
    await supabase
      .from("complaints")
      .update({ status: "in_progress", updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", complaintId);
  }

  // Completing the Complaint Investigation form stamps the investigation completed
  // date (only if not already set).
  if (formKey === "complaints_concerns") {
    await supabase
      .from("complaints")
      .update({ investigation_completed: todayIso(), updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", complaintId)
      .is("investigation_completed", null);
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "complaint.evidence_added",
    entityType: "complaint",
    entityId: complaintId,
    summary: "Added a completed form as complaint evidence",
    metadata: { evidence_id: result.evidenceId, form_key: formKey },
  });

  revalidatePath(`/complaints/${complaintId}`);
  revalidatePath("/complaints");
  // Return ok WITHOUT redirectTo so the shared FormEvidenceDialog closes itself and
  // refreshes. (A redirectTo keeps the dialog open on "Saving…" because its busy
  // state stays true and it never calls setOpen(false) on the redirect path.)
  return { ok: "Evidence saved." };
}

/** Company Admin: save the complaint response timescales (Settings > Complaints). */
export async function updateComplaintsConfig(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  if (profile.role !== "company_admin" && profile.role !== "platform_admin") {
    return { error: "Only an Admin can change these settings." };
  }

  const num = (name: string, fallback: number) => {
    const n = Number.parseInt(String(formData.get(name) ?? "").trim(), 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("complaints_config")
    .upsert(
      {
        company_id: profile.company_id,
        acknowledgement_days: num("acknowledgement_days", 3),
        response_days: num("response_days", 25),
        amber_days: num("amber_days", 5),
        count_working_days: formData.get("count_working_days") === "on",
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );
  if (error) return { error: error.message };

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "company.complaints_config_updated",
    entityType: "company",
    entityId: profile.company_id,
    summary: "Updated complaint response timescales",
  });

  revalidatePath("/settings/complaints");
  return { ok: "Saved." };
}

/** Non-exported helper: complaint fields into paragraph HTML for the email body. */
function paragraphsToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

/** AI: draft an Initial Response (acknowledgement) for a complaint from its details.
 *  Email format when the complainant wants email, otherwise a formal letter to print
 *  on headed paper. Returns the draft as JSON in `ok` for the client to review. Metered
 *  AI usage; Enterprise tier (ai_features) gated. */
export async function generateInitialResponse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  const id = String(formData.get("complaint_id") ?? "");
  if (!id || !profile.company_id) return { error: "Missing complaint." };
  if (!MANAGE_ROLES.includes(profile.role)) return { error: "You do not have permission." };

  const gated = await requireFeature(profile.company_id, "ai_features");
  if (gated) return { error: gated };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) {
    return { error: "AI is not configured. Set ANTHROPIC_API_KEY and ANTHROPIC_MODEL to enable this." };
  }

  const supabase = await createClient();
  const { data: c } = await supabase
    .from("complaints")
    .select("*, branches(name), companies:company_id(name)")
    .eq("id", id)
    .maybeSingle();
  if (!c) return { error: "That complaint could not be found." };

  const method = c.contact_method === "email" ? "email" : "post";
  const companyName = ((c.companies as { name: string } | null)?.name) ?? "the care provider";
  const branchName = ((c.branches as { name: string } | null)?.name) ?? "";
  const relationship = c.complainant_relationship
    ? RELATIONSHIP_LABELS[c.complainant_relationship as ComplaintRelationship]
    : "not stated";

  const facts = [
    `Care provider: ${companyName}${branchName ? ` (${branchName} branch)` : ""}`,
    `Complaint reference: #${c.ref_number}`,
    `Complainant: ${c.complainant_name || "not named"} (${relationship})`,
    `Subject: ${c.subject}`,
    c.concern_type ? `Category: ${c.concern_type}` : null,
    c.formality ? `Nature: ${c.formality}` : null,
    c.date_raised ? `Date raised: ${formatDisplayDate(c.date_raised as string)}` : null,
    c.date_occurred ? `Date it happened: ${formatDisplayDate(c.date_occurred as string)}` : null,
    c.response_due ? `We aim to respond fully by: ${formatDisplayDate(c.response_due as string)}` : null,
    c.details ? `Details: ${c.details}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const jsonShape =
    method === "email"
      ? `{"subject": "<email subject>", "body": "<email body>"}`
      : `{"body": "<letter body>"}`;
  const formatGuidance =
    method === "email"
      ? "Write a warm, professional acknowledgement EMAIL. Confirm the complaint has been received, that it is being taken seriously and investigated, give the date we aim to respond by if provided, and invite them to get in touch with any questions. Sign off from the team, not a named individual."
      : "Write a formal acknowledgement LETTER to be printed on the company's headed paper. Start with a salutation to the complainant, use short paragraphs, then end with 'Yours sincerely,' followed by a blank line for the manager to sign. Do NOT include the sender address, recipient address or the date (the headed paper carries these).";

  const prompt = `You are writing on behalf of ${companyName}, a UK care provider, responding to a complaint. ${formatGuidance}\n\nUse only these details, do not invent facts:\n${facts}\n\nReturn ONLY valid JSON in exactly this shape, no markdown, no commentary: ${jsonShape}`;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
    });
  } catch (e) {
    return { error: `AI request failed: ${(e as Error).message}` };
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).replace(/sk-ant-[A-Za-z0-9_-]{6,}/g, "[redacted]");
    return { error: `AI request failed (${res.status}). ${detail.slice(0, 160)}` };
  }

  const json = (await res.json()) as {
    content?: Array<{ text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  await recordUsage({
    companyId: profile.company_id,
    kind: "ai",
    units: (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0),
    metadata: { feature: "complaint_initial_response", input_tokens: json.usage?.input_tokens ?? 0, output_tokens: json.usage?.output_tokens ?? 0 },
  });

  const raw = json.content?.map((b) => b.text ?? "").join("") ?? "";
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return { error: "The AI response could not be read. Try again." };
  let parsed: { subject?: string; body?: string };
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { error: "The AI response could not be read. Try again." };
  }
  if (!parsed.body) return { error: "The AI returned an empty response. Try again." };

  return { ok: JSON.stringify({ method, subject: parsed.subject ?? "", body: parsed.body }) };
}

/** Send an approved Initial Response email via Resend, record it, and stamp the
 *  complaint as acknowledged today. */
export async function sendInitialResponse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("complaint_id") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!id || !profile.company_id) return { error: "Missing complaint." };
  if (!MANAGE_ROLES.includes(profile.role)) return { error: "You do not have permission." };
  if (!body) return { error: "The response is empty." };

  const supabase = await createClient();
  const { data: c } = await supabase
    .from("complaints")
    .select("id, branch_id, contact_method, contact_email, date_acknowledged")
    .eq("id", id)
    .maybeSingle();
  if (!c) return { error: "That complaint could not be found." };
  if (c.contact_method !== "email") return { error: "This complaint's preferred contact is not email." };
  if (!c.contact_email) return { error: "There is no contact email on this complaint." };

  const finalSubject = subject || "Response to your complaint";
  const send = await sendEmail({
    to: c.contact_email as string,
    subject: finalSubject,
    html: noticeEmailHtml({
      preheader: finalSubject,
      heading: finalSubject,
      bodyHtml: paragraphsToHtml(body),
      footerNote: "This message was sent in response to a complaint you raised.",
    }),
    replyTo: profile.email ?? undefined,
  });
  if (!send.sent) {
    return { error: send.error ?? send.skippedReason ?? "The email could not be sent." };
  }

  await supabase.from("complaint_responses").insert({
    company_id: profile.company_id,
    branch_id: c.branch_id,
    complaint_id: id,
    method: "email",
    subject: finalSubject,
    body,
    recipient: c.contact_email,
    sent_at: new Date().toISOString(),
    created_by: user.id,
  });

  if (!c.date_acknowledged) {
    await supabase
      .from("complaints")
      .update({ date_acknowledged: todayIso(), updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "complaint.response_sent",
    entityType: "complaint",
    entityId: id,
    summary: "Sent an initial response email to the complainant",
    metadata: { method: "email", recipient: c.contact_email },
  });

  revalidatePath(`/complaints/${id}`);
  return { ok: "Response sent to the complainant." };
}

/** Record an approved postal Initial Response (letter copied onto headed paper) and
 *  stamp the complaint as acknowledged today. */
export async function recordPostalResponse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  const id = String(formData.get("complaint_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!id || !profile.company_id) return { error: "Missing complaint." };
  if (!MANAGE_ROLES.includes(profile.role)) return { error: "You do not have permission." };
  if (!body) return { error: "The letter is empty." };

  const supabase = await createClient();
  const { data: c } = await supabase
    .from("complaints")
    .select("id, branch_id, contact_address, date_acknowledged")
    .eq("id", id)
    .maybeSingle();
  if (!c) return { error: "That complaint could not be found." };

  await supabase.from("complaint_responses").insert({
    company_id: profile.company_id,
    branch_id: c.branch_id,
    complaint_id: id,
    method: "post",
    subject: null,
    body,
    recipient: c.contact_address,
    sent_at: null,
    created_by: user.id,
  });

  if (!c.date_acknowledged) {
    await supabase
      .from("complaints")
      .update({ date_acknowledged: todayIso(), updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "complaint.response_recorded",
    entityType: "complaint",
    entityId: id,
    summary: "Recorded a postal initial response letter",
    metadata: { method: "post" },
  });

  revalidatePath(`/complaints/${id}`);
  return { ok: "Letter recorded." };
}
