import "server-only";

/**
 * Be Care Compliant — sending the person a copy of the form that is about them.
 *
 * WHY (Phil, 2026-09-08): "if they select conducted over telephone, add a 'would you like
 * to email a copy to the team member', if they tick yes, when complete and save is
 * clicked, email over a copy."
 *
 * A face to face review ends with the care worker signing the form in front of the
 * manager, so they have seen what it says. One done over the phone ends with neither
 * signature nor sight of it. Emailing the record over is how the telephone version earns
 * the same standing as the face to face one.
 *
 * TRIGGERED BY AN ANSWER, NOT BY A FORM. Any form that asks a question keyed `email_copy`
 * and is answered "yes" sends a copy, so a second form wanting the same behaviour asks the
 * same question rather than needing a branch in here.
 *
 * WHAT IS SENT is the Evidence PDF: the same immutable document the Reports section
 * produces, rendered from the schema and answers that were just stored, so what lands in
 * their inbox is exactly what is on file rather than a summary of it.
 *
 * BEST EFFORT, BUT NEVER SILENT. The Evidence is already saved by the time this runs and
 * nothing here may undo that, so a failure returns a sentence for the caller to show
 * instead of throwing. The one thing worse than not sending it is a manager believing it
 * went when it did not.
 */

import { renderEvidencePdf } from "./pdf";
import { loadEvidenceSubject, type EvidenceRecordType } from "./subject";
import { sendEmail } from "@/lib/email/resend";
import { noticeEmailHtml } from "@/lib/email/templates";
import type { Answers, FormSchema } from "@/lib/form-schema";

export type EmailCopyInput = {
  schema: FormSchema;
  answers: Answers;
  /** The record the form is about. The PDF names it at the top of the page, so the
   *  copy that lands in somebody's inbox says whose check it is exactly as the stored
   *  evidence does. */
  recordType: EvidenceRecordType;
  recordId: string;
  /** The person the form is about, and where to send it. */
  recipientName: string | null;
  recipientEmail: string | null;
  companyName: string;
  branchName: string | null;
  formName: string;
  formVersion: number;
  authorName: string | null;
  authorEmail: string | null;
  evidenceId: string;
};

/** Did this set of answers ask for a copy to be emailed over? */
export function wantsEmailCopy(answers: Answers): boolean {
  return String(answers.email_copy ?? "") === "yes";
}

/**
 * Send the copy. Returns null when it went, or a sentence explaining why it did not.
 */
export async function emailEvidenceCopy(input: EmailCopyInput): Promise<string | null> {
  const to = (input.recipientEmail ?? "").trim();
  if (!to) {
    return `${input.formName} was saved, but there is no email address on this record to send a copy to.`;
  }

  let pdf: Buffer;
  try {
    pdf = await renderEvidencePdf(input.schema, input.answers, {
      subject: await loadEvidenceSubject(input.recordType, input.recordId),
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
    return `${input.formName} was saved, but the copy could not be prepared, so no email was sent.`;
  }

  const first = (input.recipientName ?? "").trim().split(" ")[0] || "there";
  const result = await sendEmail({
    to,
    subject: `${input.formName} from ${input.companyName}`,
    html: noticeEmailHtml({
      preheader: `A copy of your ${input.formName.toLowerCase()}.`,
      heading: `Your ${input.formName.toLowerCase()}`,
      bodyHtml:
        `<p>Hello ${first},</p>` +
        `<p>Your ${input.formName.toLowerCase()} was carried out by telephone, so here is a copy for your records. It is attached to this email as a PDF.</p>` +
        `<p>If anything in it does not match your understanding of the conversation, please speak to your manager.</p>`,
      footerNote: `Sent by ${input.companyName}. Please do not reply to this email.`,
    }),
    attachments: [
      {
        filename: `${input.formName.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`,
        content: pdf.toString("base64"),
        contentType: "application/pdf",
      },
    ],
  });

  if (!result.sent) {
    return `${input.formName} was saved, but the copy could not be emailed: ${result.skippedReason ?? result.error ?? "the email was not accepted"}.`;
  }
  return null;
}
