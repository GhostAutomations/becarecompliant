import "server-only";

/**
 * Be Care Compliant — an escalated review reaches a manager.
 *
 * Phil, 2026-09-09, asked what happens when the Individual Plan Review's "Escalate
 * review" box is ticked. The honest answer was NOTHING: the box stored true in the
 * Evidence, printed on the PDF and told nobody. A reviewer at a kitchen table ticked it,
 * believed they had escalated, and went home; on Monday the branch manager knew nothing.
 * A tick that records somebody raising a concern nobody acted on is worse on an
 * inspection than never having asked.
 *
 * He chose the fix: "email the form to the branch manager". The FORM, not a summary —
 * the same immutable Evidence PDF that is on file, so what the manager reads and what an
 * inspector would read are one document.
 *
 * TRIGGERED BY AN ANSWER, NOT BY A FORM, exactly like the email_copy question next door:
 * any form with a checkbox keyed `escalate_review` earns this behaviour by asking the
 * question, without a branch in here naming forms.
 *
 * BEST EFFORT, NEVER SILENT. The Evidence is saved before this runs and nothing here may
 * undo it, so a failure comes back as a sentence for the caller to show. The one thing
 * worse than an escalation not going is somebody believing it went.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { noticeEmailHtml, escapeHtml } from "@/lib/email/templates";
import { renderEvidencePdf } from "./pdf";
import { loadEvidenceSubject } from "./subject";
import { escalationRecipients, type Recipient } from "./escalation-recipients";
import { flattenFields, type Answers, type FormSchema } from "@/lib/form-schema";

/** Did this set of answers ask for the review to be escalated? */
export function wantsEscalation(schema: FormSchema, answers: Answers): boolean {
  const field = flattenFields(schema).find(
    (f) => f.key === "escalate_review" && f.type === "checkbox",
  );
  if (!field) return false;
  const v = answers[field.key];
  return v === true || v === "true" || v === "yes";
}

export type EscalationInput = {
  schema: FormSchema;
  answers: Answers;
  evidenceId: string;
  companyId: string;
  companyName: string;
  /** The branch the RECORD sits in — whose manager is being escalated to. */
  branchId: string | null;
  branchName: string | null;
  formName: string;
  formVersion: number;
  authorName: string | null;
  authorEmail: string | null;
  recordType: "person" | "service_user" | "complaint";
  recordId: string;
  /** Where the manager can open the record. */
  recordUrl: string;
};

/** Send it. Returns null when it went, or a sentence explaining why it did not. */
export async function escalateEvidence(input: EscalationInput): Promise<string | null> {
  const admin = createServiceClient();

  const [{ data: profiles }, { data: assigned }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, email, role, status")
      .eq("company_id", input.companyId),
    input.branchId
      ? admin.from("user_branches").select("user_id").eq("branch_id", input.branchId)
      : Promise.resolve({ data: [] as Array<{ user_id: string }> }),
  ]);

  const inBranch = new Set(((assigned as Array<{ user_id: string }> | null) ?? []).map((r) => r.user_id));
  const candidates: Recipient[] = (
    ((profiles as Array<Omit<Recipient, "inBranch">> | null) ?? [])
  ).map((p) => ({ ...p, inBranch: inBranch.has(p.id) }));

  const recipients = escalationRecipients(candidates);
  if (recipients.length === 0) {
    return `${input.formName} was saved and marked for escalation, but there is no manager with an email address to send it to. Tell the branch manager yourself.`;
  }

  const subject = await loadEvidenceSubject(input.recordType, input.recordId);

  let pdf: Buffer;
  try {
    pdf = await renderEvidencePdf(input.schema, input.answers, {
      subject,
      companyName: input.companyName,
      branchName: input.branchName,
      formName: input.formName,
      formVersion: input.formVersion,
      authorName: input.authorName,
      authorEmail: input.authorEmail,
      submittedAt: new Date(),
      evidenceRef: input.evidenceId.slice(0, 8).toUpperCase(),
    });
  } catch {
    return `${input.formName} was saved and marked for escalation, but the document could not be prepared, so no email was sent. Tell the branch manager yourself.`;
  }

  const who = escapeHtml(subject.name);
  const form = escapeHtml(input.formName);
  const by = escapeHtml(input.authorName || input.authorEmail || "a colleague");
  const failures: string[] = [];

  for (const r of recipients) {
    const first = (r.full_name ?? "").trim().split(" ")[0] || "there";
    const result = await sendEmail({
      to: (r.email ?? "").trim(),
      subject: `Escalated: ${input.formName} for ${subject.name}`,
      html: noticeEmailHtml({
        preheader: `${by} escalated a ${input.formName.toLowerCase()} to you.`,
        heading: `${form} escalated to you`,
        bodyHtml:
          `<p>Hello ${escapeHtml(first)},</p>` +
          `<p><strong>${by}</strong> completed a ${form.toLowerCase()} for <strong>${who}</strong>` +
          `${input.branchName ? ` at ${escapeHtml(input.branchName)}` : ""} and marked it as needing to come to you.</p>` +
          `<p>The completed form is attached exactly as it is held on file. Read it and decide what needs doing.</p>`,
        ctaLabel: "Open the record",
        ctaUrl: input.recordUrl,
        footerNote: `Evidence reference ${input.evidenceId.slice(0, 8).toUpperCase()}. Sent by ${escapeHtml(input.companyName)}. Please do not reply to this email.`,
      }),
      attachments: [
        {
          filename: `${input.formName.replace(/[^A-Za-z0-9]+/g, "-")}-${subject.name.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`,
          content: pdf.toString("base64"),
          contentType: "application/pdf",
        },
      ],
    });
    if (!result.sent) {
      failures.push(r.full_name || r.email || "a manager");
    }
  }

  if (failures.length === recipients.length) {
    return `${input.formName} was saved and marked for escalation, but the email could not be sent. Tell the branch manager yourself.`;
  }
  if (failures.length > 0) {
    return `${input.formName} was escalated, but the email did not reach ${failures.join(", ")}.`;
  }
  return null;
}
