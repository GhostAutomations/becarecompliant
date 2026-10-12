"use server";

/**
 * Be Care Compliant: the Initial Response and the Complaint Response as signed PDF letters (Phil,
 * 2026-10-12, THE LIST 54, docs/decisions/complaint-letters.md).
 *
 * Laid out like the absence letters and drawn by the same PDF layout: the company's letterhead,
 * the complainant's name and address, Dear, an RE line with the complaint reference, the words,
 * and the sign off of whoever sends it, with their signature choice and job title.
 *
 * - Draft: the AI writes the words on a button press (the gold AI chip), and the draft is kept on
 *   the complaint, so opening the box again costs nothing. Regenerate spends a new credit.
 * - Preview: the real PDF of the words on screen, and the frame the editor draws around them.
 * - Send: an email complainant gets the letter in the email with the signed PDF attached (and any
 *   ticked investigation files, for the full response); a postal one gets Save and print, which
 *   keeps the PDF and opens it to print. Either way the PDF is kept on the complaint, unchanged.
 *
 * RLS is the guard (is_company_admin / is_branch_manager on complaints and complaint_responses);
 * the role check here gives a plain message first.
 */

import { randomUUID, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { runAi, giveBackAiCredits } from "@/lib/ai/anthropic";
import { sendEmail, type EmailAttachment } from "@/lib/email/resend";
import { noticeEmailHtml } from "@/lib/email/templates";
import { EVIDENCE_BUCKET } from "@/lib/evidence/storage";
import { queueCloudCopy } from "@/lib/cloud/queue";
import { pathInCompany } from "@/lib/storage/company-path";
import { getCompanyLogoDataUrl } from "@/lib/invoicing/logo";
import { officeAddress, resolveBranchAddress, type BranchAddressRow } from "@/lib/branches/office-address";
import { formatCivilDate, todayInLondon } from "@/lib/recurrence";
import { renderOutcomeLetterPdf } from "@/lib/absence/outcome-letter-pdf";
import type { OutcomeLetterDoc } from "@/lib/absence/invitation-letter";
import { letterEmailHtml, letterPlainText, toLetterHtml } from "@/lib/letters/rich-text";
import { letterFrameOf, type LetterFrame } from "@/lib/letters/letter-frame";
import { auditSignatureUse, letterJobTitle, resolveLetterSignature, type LetterSignature } from "@/lib/letters/signature";
import { COMPLAINTS_ROLES as MANAGE_ROLES } from "@/lib/auth/module-roles";
import type { ActionState } from "@/lib/forms";
import { getComplaintRefPrefix, getInvestigationEvidence } from "./data";
import { formatComplaintRef, formatDisplayDate, todayIso } from "./logic";
import { RELATIONSHIP_LABELS, type ComplaintRelationship } from "./types";
import {
  COMPLAINT_LETTER_RULES,
  buildComplaintLetterDoc,
  cleanComplaintLetterBody,
  complaintEmailSubject,
  type ComplaintLetterKind,
} from "./complaint-letter";

const LETTER_LIMIT = 40_000;

type ComplaintRow = {
  id: string;
  company_id: string;
  branch_id: string | null;
  ref_number: number;
  date_raised: string | null;
  date_occurred: string | null;
  response_due: string | null;
  date_acknowledged: string | null;
  subject: string | null;
  details: string | null;
  concern_type: string | null;
  formality: string | null;
  complainant_name: string | null;
  complainant_relationship: string | null;
  contact_method: string | null;
  contact_email: string | null;
  contact_address: string | null;
  investigation_completed: string | null;
  initial_response_draft: string | null;
  response_draft: string | null;
};

function kindOf(v: FormDataEntryValue | null): ComplaintLetterKind | null {
  return v === "initial" || v === "response" ? v : null;
}

/** The complaint, its reference and who is asking, or a plain message. */
async function load(formData: FormData) {
  const { user, profile } = await requireCompany();
  const companyId = profile.company_id;
  const kind = kindOf(formData.get("kind"));
  const complaintId = String(formData.get("complaint_id") ?? "");
  if (!companyId || !complaintId || !kind) return { error: "Missing complaint." } as const;
  if (!MANAGE_ROLES.includes(profile.role)) return { error: "You do not have permission." } as const;
  const supabase = await createClient();
  const { data } = await supabase
    .from("complaints")
    .select(
      "id, company_id, branch_id, ref_number, date_raised, date_occurred, response_due, date_acknowledged, subject, details, concern_type, formality, complainant_name, complainant_relationship, contact_method, contact_email, contact_address, investigation_completed, initial_response_draft, response_draft",
    )
    .eq("id", complaintId)
    .maybeSingle();
  const c = data as ComplaintRow | null;
  if (!c || c.company_id !== companyId) return { error: "That complaint could not be found." } as const;
  const ref = formatComplaintRef(await getComplaintRefPrefix(companyId), c.date_raised, c.ref_number);
  return { user, profile, companyId, kind, supabase, c, ref };
}

type Loaded = Exclude<Awaited<ReturnType<typeof load>>, { error: string }>;

/** The company's name, letterhead and logo: the complaint's branch office when it has premises of
 *  its own, else the main office, as the absence letters do. */
async function letterhead(companyId: string, branchId: string | null) {
  const admin = createServiceClient();
  const [{ data: company }, { data: branches }, logoDataUrl] = await Promise.all([
    admin.from("companies").select("name").eq("id", companyId).maybeSingle(),
    admin.from("branches").select("id, name, kind, address, phone, uses_office_address").eq("company_id", companyId),
    getCompanyLogoDataUrl(companyId).catch(() => null),
  ]);
  const rows = (branches ?? []) as (BranchAddressRow & { phone: string | null })[];
  const office = rows.find((b) => b.kind === "team") ?? null;
  const own = rows.find((b) => b.id === branchId) ?? null;
  const head = own && own.kind !== "team" && !own.uses_office_address ? own : office;
  return {
    companyName: (company?.name as string | undefined) ?? "Your care provider",
    letterheadAddress: head ? resolveBranchAddress(head, officeAddress(rows)).address : null,
    letterheadPhone: (head?.phone ?? null) || null,
    logoDataUrl,
    branchName: own?.name ?? "",
  };
}

/** The letter as it stands, ready to draw: the frame and the words, signed by whoever sends it. */
async function compose(l: Loaded, bodyHtml: string, signature: LetterSignature | null) {
  const head = await letterhead(l.companyId, l.c.branch_id);
  const signer = signature
    ? { name: signature.signerName, role: signature.signerRole }
    : { name: l.profile.full_name || "The team", role: await letterJobTitle(l.companyId, l.profile.id) };
  const doc = buildComplaintLetterDoc({
    kind: l.kind,
    ref: l.ref,
    companyName: head.companyName,
    letterheadAddress: head.letterheadAddress,
    letterheadPhone: head.letterheadPhone,
    letterDateIso: formatCivilDate(todayInLondon()),
    recipientName: l.c.complainant_name,
    recipientAddress: l.c.contact_method === "email" ? null : l.c.contact_address,
    bodyHtml,
    signer,
  });
  return { doc, head, signatureDataUrl: signature?.dataUrl ?? null };
}

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The letter in the email body, in the same order as the PDF. */
function letterDocHtml(doc: OutcomeLetterDoc): string {
  const p = (t: string, style = "") =>
    `<p style="margin:0 0 10px 0;${style}">${t ? esc(t).replace(/\n/g, "<br>") : "&nbsp;"}</p>`;
  return [
    p(doc.date),
    p(doc.salutation),
    p(doc.reLine, "font-weight:700;"),
    letterEmailHtml(doc.body),
    p([doc.signOff.closing, "", doc.signOff.name, doc.signOff.role ?? ""].filter((x, i) => i === 1 || x).join("\n")),
  ].join("");
}

/** What the AI is told about the complaint, for each letter. */
async function factsFor(l: Loaded, head: { companyName: string; branchName: string }): Promise<string | { error: string }> {
  const c = l.c;
  const relationship = c.complainant_relationship
    ? RELATIONSHIP_LABELS[c.complainant_relationship as ComplaintRelationship] ?? "not stated"
    : "not stated";
  const base = [
    `Care provider: ${head.companyName}${head.branchName ? ` (${head.branchName} branch)` : ""}`,
    `Complaint reference: ${l.ref}`,
    `Complainant: ${c.complainant_name || "not named"} (${relationship})`,
    `Subject: ${c.subject ?? ""}`,
  ];
  if (l.kind === "initial") {
    return [
      ...base,
      c.concern_type ? `Category: ${c.concern_type}` : null,
      c.formality ? `Nature: ${c.formality}` : null,
      c.date_raised ? `Date raised: ${formatDisplayDate(c.date_raised)}` : null,
      c.date_occurred ? `Date it happened: ${formatDisplayDate(c.date_occurred)}` : null,
      c.response_due ? `We aim to respond fully by: ${formatDisplayDate(c.response_due)}` : null,
      c.details ? `Details: ${c.details}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  const inv = await getInvestigationEvidence(l.companyId, c.id);
  if (!inv) return { error: "Complete the Complaint Investigation form first, then draft the response from it." };
  const s = (k: string): string | null => {
    const v = inv.answers[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  return [
    ...base,
    s("describe_complaint") ? `What the complaint was about: ${s("describe_complaint")}` : null,
    s("category") ? `Category: ${s("category")}` : null,
    s("initial_response") ? `Initial response given when raised: ${s("initial_response")}` : null,
    s("desired_outcome") ? `Outcome the complainant wanted: ${s("desired_outcome")}` : null,
    s("investigation_outcome") ? `Outcome of the investigation: ${s("investigation_outcome")}` : null,
    c.investigation_completed ? `Investigation completed on: ${formatDisplayDate(c.investigation_completed)}` : null,
    c.details ? `Original details logged: ${c.details}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

const INITIAL_SYSTEM = [
  "You are writing, for a UK care provider, the acknowledgement letter to someone who has made a",
  "complaint. Confirm the complaint has been received and is being taken seriously and looked into, give",
  "the date we aim to respond by if one is given, and invite them to get in touch with any questions.",
  COMPLAINT_LETTER_RULES,
].join(" ");

const RESPONSE_SYSTEM = [
  "You are writing, for a UK care provider, the full response letter to a complaint after investigating",
  "it. Thank them, summarise the complaint, explain that it has been investigated and what was found or",
  "done, state the outcome and any actions taken or apology, and say they can come back to us if they are",
  "not satisfied and may take it to the relevant Ombudsman.",
  "IMPORTANT: the complainant is outside the organisation. Never disclose confidential staff or HR",
  "matters or disciplinary outcomes (for example that a member of staff was dismissed, suspended or",
  "warned), even if the investigation notes contain them, and never name a member of staff. You may say",
  "the matter has been taken seriously and appropriate action taken with the staff involved.",
  COMPLAINT_LETTER_RULES,
].join(" ");

/** What the box needs when it opens: the kept draft (free), and the investigation's files that
 *  can go with an emailed full response. Spends nothing. */
export async function complaintLetterSetup(
  formData: FormData,
): Promise<{ draft?: string | null; attachments?: Array<{ path: string; name: string }>; hasInvestigation?: boolean; error?: string }> {
  const l = await load(formData);
  if ("error" in l) return { error: l.error };
  const draft = (l.kind === "initial" ? l.c.initial_response_draft : l.c.response_draft) ?? null;
  if (l.kind === "initial") return { draft, attachments: [], hasInvestigation: true };
  const inv = await getInvestigationEvidence(l.companyId, l.c.id);
  return {
    draft,
    attachments: (inv?.attachments ?? []).map((f) => ({ path: f.path, name: f.name })),
    hasInvestigation: Boolean(inv),
  };
}

/**
 * Draft the letter's words with the AI. The kept draft is handed back for nothing unless
 * Regenerate was pressed; a new one is kept on the complaint. A reply with no usable words is
 * never kept and its credit is given back.
 */
export async function draftComplaintLetter(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const l = await load(formData);
  if ("error" in l) return { error: l.error };
  const column = l.kind === "initial" ? "initial_response_draft" : "response_draft";
  const kept = l.kind === "initial" ? l.c.initial_response_draft : l.c.response_draft;
  if (kept && formData.get("regenerate") !== "1") return { ok: "Drafted", data: { body: kept } };

  const head = await letterhead(l.companyId, l.c.branch_id);
  const facts = await factsFor(l, head);
  if (typeof facts !== "string") return { error: facts.error };
  const result = await runAi({
    companyId: l.companyId,
    feature: l.kind === "initial" ? "complaint_initial_response" : "complaint_response",
    system: l.kind === "initial" ? INITIAL_SYSTEM : RESPONSE_SYSTEM,
    prompt: `Use only these details, do not invent facts:\n${facts}`,
    maxTokens: 1800,
    refuseIfCut: true,
  });
  if ("error" in result) return { error: result.error };
  const body = cleanComplaintLetterBody(result.ok, l.c.complainant_name);
  if (!letterPlainText(body).trim()) {
    await giveBackAiCredits(l.companyId, 1);
    return { error: "The letter came back empty, so it was not kept. Your AI credit has been given back. Try again." };
  }
  const { data: saved, error } = await l.supabase
    .from("complaints")
    .update({ [column]: body })
    .eq("id", l.c.id)
    .select("id");
  // Shown either way: the words are on screen. Only keeping them for next time failed.
  if (error || !saved?.length) {
    return { ok: "Drafted", data: { body, note: "The draft could not be kept on the complaint, so opening this again will draft it again." } };
  }
  revalidatePath(`/complaints/${l.c.id}`);
  return { ok: "Drafted", data: { body } };
}

/** The real PDF of the letter as it stands, and the frame the editor draws around the words.
 *  Saves and sends nothing. */
export async function previewComplaintLetter(
  formData: FormData,
): Promise<{ pdf?: string; frame?: LetterFrame; to?: string | null; name?: string; error?: string }> {
  const l = await load(formData);
  if ("error" in l) return { error: l.error };
  const body = toLetterHtml(String(formData.get("body") ?? "").slice(0, LETTER_LIMIT));
  if (!letterPlainText(body).trim()) return { error: "Draft or write the letter first." };
  const signed = await resolveLetterSignature(formData, l.profile);
  if ("error" in signed) return { error: signed.error };
  try {
    const { doc, head, signatureDataUrl } = await compose(l, body, signed.signature);
    const pdf = await renderOutcomeLetterPdf({ letter: doc, logoDataUrl: head.logoDataUrl, signatureDataUrl });
    return {
      pdf: pdf.toString("base64"),
      frame: letterFrameOf(doc, head.logoDataUrl, signatureDataUrl),
      to: l.c.contact_method === "email" ? l.c.contact_email : null,
      name: l.c.complainant_name ?? "the complainant",
    };
  } catch (e) {
    return { error: `The letter could not be drawn: ${(e as Error).message}` };
  }
}

/**
 * Send the letter. Email: the letter in the email with the signed PDF attached (and the ticked
 * investigation files, for the full response). Print: kept, marked as a letter to post, and handed
 * back to open and print. Either way the PDF is kept on the complaint and the response recorded.
 */
export async function sendComplaintLetter(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const l = await load(formData);
  if ("error" in l) return { error: l.error };
  const body = toLetterHtml(String(formData.get("body") ?? "").slice(0, LETTER_LIMIT));
  if (!letterPlainText(body).trim()) return { error: "The letter is empty." };
  const emailTo = l.c.contact_method === "email" ? (l.c.contact_email ?? "").trim() : "";
  const delivery = formData.get("delivery") === "email" && emailTo ? "email" : "print";
  const signed = await resolveLetterSignature(formData, l.profile);
  if ("error" in signed) return { error: signed.error };

  let composed: Awaited<ReturnType<typeof compose>>;
  let pdf: Buffer;
  try {
    composed = await compose(l, body, signed.signature);
    pdf = await renderOutcomeLetterPdf({
      letter: composed.doc,
      logoDataUrl: composed.head.logoDataUrl,
      signatureDataUrl: composed.signatureDataUrl,
    });
  } catch (e) {
    return { error: `The letter could not be drawn: ${(e as Error).message}` };
  }

  // The PDF is kept first, in the company's own folder; nothing is recorded without it.
  const responseId = randomUUID();
  const path = `${l.companyId}/complaint-letters/${responseId}.pdf`;
  if (!pathInCompany(path, l.companyId)) return { error: "The letter could not be stored." };
  const admin = createServiceClient();
  const up = await admin.storage.from(EVIDENCE_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (up.error) return { error: `The letter's PDF could not be stored: ${up.error.message}` };
  const dropFile = () => admin.storage.from(EVIDENCE_BUCKET).remove([path]);

  const subject = complaintEmailSubject(l.kind, l.ref);
  let sentAt: string | null = null;
  let note = "";
  let attached = 0;
  if (delivery === "email") {
    const attachments: EmailAttachment[] = [
      { filename: `${subject}.pdf`.replace(/[\\/:*?"<>|]/g, ""), content: pdf.toString("base64"), contentType: "application/pdf" },
    ];
    if (l.kind === "response") {
      let wanted: string[] = [];
      try {
        const parsed = JSON.parse(String(formData.get("attachment_paths") ?? "[]"));
        if (Array.isArray(parsed)) wanted = parsed.map(String);
      } catch {
        // none ticked
      }
      if (wanted.length) {
        // Only files that belong to this complaint's investigation.
        const inv = await getInvestigationEvidence(l.companyId, l.c.id);
        const allowed = new Map((inv?.attachments ?? []).map((f) => [f.path, f]));
        for (const p of wanted) {
          const f = allowed.get(p);
          if (!f || !pathInCompany(p, l.companyId)) continue;
          const { data: blob } = await admin.storage.from(EVIDENCE_BUCKET).download(p);
          if (!blob) continue;
          attachments.push({ filename: f.name, content: Buffer.from(await blob.arrayBuffer()).toString("base64"), contentType: f.mime });
          attached++;
        }
      }
    }
    const result = await sendEmail({
      companyId: l.companyId,
      to: emailTo,
      subject,
      html: noticeEmailHtml({
        preheader: subject,
        heading: subject,
        bodyHtml: letterDocHtml(composed.doc),
        footerNote: `This letter is attached as a PDF for you to keep. It is sent on behalf of ${composed.head.companyName}.`,
      }),
      replyTo: l.profile.email ?? undefined,
      attachments,
    });
    if (result.sent) {
      sentAt = new Date().toISOString();
    } else if (result.skippedReason && !/RESEND/.test(result.skippedReason)) {
      // Not sent on purpose (a test company): kept as a letter, and said why.
      note = ` It was not emailed: ${result.skippedReason}`;
    } else {
      await dropFile();
      return {
        error: result.skippedReason
          ? "Email is not set up for this service (RESEND_API_KEY / RESEND_FROM). Nothing was sent or recorded."
          : `The email could not be sent: ${result.error ?? "unknown error"}. Nothing was recorded; try again.`,
      };
    }
  }

  const { error: insErr } = await l.supabase.from("complaint_responses").insert({
    id: responseId,
    company_id: l.companyId,
    branch_id: l.c.branch_id,
    complaint_id: l.c.id,
    kind: l.kind,
    method: delivery === "email" ? "email" : "post",
    subject: delivery === "email" ? subject : null,
    body: letterPlainText(body),
    recipient: delivery === "email" ? emailTo : l.c.contact_address,
    sent_at: sentAt,
    created_by: l.user.id,
    pdf_path: path,
    pdf_sha256: createHash("sha256").update(pdf).digest("hex"),
  });
  if (insErr) {
    await dropFile();
    return {
      error:
        sentAt
          ? `The email went, but it could not be recorded: ${insErr.message}. Tell Be Care Compliant.`
          : `The letter could not be recorded: ${insErr.message}`,
    };
  }

  // A copy to the company's cloud drive, beside the complaint's forms (Phil, 2026-10-12).
  await queueCloudCopy({ companyId: l.companyId, kind: "complaint_letter", sourceId: responseId, dedupeKey: `complaint_letter:${responseId}` });

  // Sending the first reply acknowledges the complaint today.
  if (l.kind === "initial" && !l.c.date_acknowledged) {
    await l.supabase
      .from("complaints")
      .update({ date_acknowledged: todayIso(), updated_by: l.user.id, updated_at: new Date().toISOString() })
      .eq("id", l.c.id);
  }

  const what = l.kind === "initial" ? "initial response" : "complaint response";
  await writeAudit({
    companyId: l.companyId,
    actorId: l.user.id,
    actorEmail: l.profile.email,
    actorRole: l.profile.role,
    action: sentAt ? "complaint.response_sent" : "complaint.response_recorded",
    entityType: "complaint",
    entityId: l.c.id,
    summary: sentAt
      ? `Sent the ${what} letter to the complainant by email, PDF attached`
      : delivery === "email"
        ? `Kept the ${what} letter, not emailed`
        : `Kept the ${what} letter to print and post`,
    metadata: { kind: l.kind, method: delivery === "email" ? "email" : "post", response_id: responseId, attachments: attached },
  });
  if (signed.signature) {
    await auditSignatureUse({
      signature: signed.signature,
      companyId: l.companyId,
      actorEmail: l.profile.email,
      actorRole: l.profile.role,
      personId: l.c.id,
      entityType: "complaint",
      letter: `complaint ${what} letter`,
      letterId: responseId,
    });
  }

  revalidatePath(`/complaints/${l.c.id}`);
  return {
    ok: sentAt
      ? `Sent to ${emailTo} with the letter attached as a PDF, and kept on the complaint.`
      : delivery === "email"
        ? `Kept on the complaint.${note}`
        : "Kept on the complaint. The letter is opening to print and post.",
    data: { responseId, href: `/api/complaints/letter/${responseId}` },
  };
}
