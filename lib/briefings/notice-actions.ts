"use server";

/**
 * Be Care Compliant — sending a memo, a message or attachments as a Briefing, and the person's
 * side of it (0435, Phil 2026-10-08).
 *
 *   startNoticeUpload : a short-lived upload link per file, so files go straight to the private
 *                       bucket and never through a Server Action (4 MB body limit).
 *   sendNotice        : writes the notice once, gives everyone chosen an assignment, emails them.
 *   openNotice        : the person opens it. Stamps when, and completes a "just read it" notice.
 *   confirmNotice     : the person presses "I have read this".
 *   signNotice        : the person signs it, filed as Evidence on their record like a policy.
 *
 * A notice is never edited after it is sent, so what each person read is what was sent. Withdraw
 * uses the same cancelAssignment as policies and forms.
 */

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { EVIDENCE_BUCKET, dataUrlToPngBuffer } from "@/lib/evidence/storage";
import { submitEvidence, type EvidenceFileInput } from "@/lib/evidence/submit";
import { getCompanyFormByKey } from "@/lib/people/data";
import { getPolicyConfig } from "@/lib/assignments/data";
import { resolveBriefingAudience } from "@/lib/assignments/audience";
import { listMemoSenders } from "@/lib/briefings/senders";
import { queueCloudCopy } from "@/lib/cloud/queue";
import { POLICY_ACK_FORM_KEY } from "@/lib/assignments/types";
import { DRAWN_KEY, TYPED_KEY, signatureGiven, type SignatureMode } from "@/lib/assignments/signing";
import { emailOfficeCopy, notifyBriefingSent } from "@/lib/notifications/briefings";
import { noticeEmailBodyHtml, parseNoticeText } from "@/lib/briefings/notice-text";
import type { Answers } from "@/lib/form-schema";
import type { ActionState } from "@/lib/forms";
import {
  NOTICE_KIND_LABELS,
  isNoticeKind,
  isNoticeResponse,
  noticeFilePath,
  noticeFileProblem,
  noticeFilesProblem,
  noticeMimeType,
  noticeProblem,
  type NoticeFile,
} from "@/lib/briefings/notice-rules";

const SENDERS = ["company_admin", "registered_individual", "registered_manager", "manager", "platform_admin"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isoOrNull(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

async function sender() {
  const ctx = await requireCompany();
  if (!ctx.profile.company_id) return { error: "No company context." as const };
  if (!SENDERS.includes(ctx.profile.role)) return { error: "Only managers can send briefings." as const };
  return { ...ctx, companyId: ctx.profile.company_id };
}

/** Step 1 of sending with files: an upload link per file. Nothing is saved until sendNotice. */
export async function startNoticeUpload(input: {
  files: Array<{ name: string; size: number }>;
}): Promise<{ ok: true; noticeId: string; uploads: Array<{ path: string; token: string }> } | { ok: false; error: string }> {
  const s = await sender();
  if ("error" in s) return { ok: false, error: s.error as string };
  const files = (Array.isArray(input?.files) ? input.files : []).map((f) => ({
    name: String(f?.name ?? ""),
    size: Number(f?.size ?? 0),
  }));
  const problem = noticeFilesProblem(files);
  if (problem) return { ok: false, error: problem };

  const noticeId = randomUUID();
  const service = createServiceClient();
  const uploads: Array<{ path: string; token: string }> = [];
  for (let i = 0; i < files.length; i++) {
    const path = noticeFilePath(s.companyId, noticeId, i + 1, files[i].name);
    const { data, error } = await service.storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { ok: false, error: `Could not start the upload: ${error?.message ?? "no upload link"}` };
    uploads.push({ path, token: data.token });
  }
  return { ok: true, noticeId, uploads };
}

/** Step 2: write the notice, give it to everyone chosen, and email them. */
export async function sendNotice(input: {
  noticeId: string;
  kind: string;
  title: string;
  body: string;
  response: string;
  dueDate: string | null;
  scope: string;
  branchId: string | null;
  personIds: string[];
  files: Array<{ path: string; name: string }>;
  /** Also email the office team a copy, for information (not tracked). */
  copyOffice?: boolean;
  /** Sent on someone else's behalf (0436): an office team member's id, or "other" with a typed
   *  name and title. Empty = from the sender. */
  fromProfileId?: string | null;
  fromName?: string | null;
  fromRole?: string | null;
}): Promise<{ ok: string } | { error: string }> {
  const s = await sender();
  if ("error" in s) return { error: s.error as string };
  const { user, profile, companyId } = s;

  const noticeId = String(input?.noticeId ?? "");
  if (!UUID.test(noticeId)) return { error: "That could not be sent. Start again." };
  const kind = String(input?.kind ?? "");
  const title = String(input?.title ?? "").trim();
  const body = String(input?.body ?? "").trim();
  const response = String(input?.response ?? "");
  const fileRefs = Array.isArray(input?.files) ? input.files : [];
  const problem = noticeProblem({ kind, title, body, fileCount: fileRefs.length });
  if (problem) return { error: problem };
  if (!isNoticeKind(kind)) return { error: "Choose a memo, a message or an attachment." };
  if (!isNoticeResponse(response)) return { error: "Choose what they must do." };
  const dueDate = isoOrNull(input?.dueDate);

  // Who it is from. Resolved here, never trusted from the browser: an office team member is
  // looked up by id in THIS company, and their name and title are frozen as sent.
  let from: { profileId: string | null; name: string; role: string | null } | null = null;
  const fromId = String(input?.fromProfileId ?? "").trim();
  if (fromId === "other") {
    const name = String(input?.fromName ?? "").trim();
    const role = String(input?.fromRole ?? "").trim();
    if (!name) return { error: "Type who the memo is from, or choose them from the list." };
    if (name.length > 120 || role.length > 120) return { error: "Keep the name and job title short." };
    from = { profileId: null, name, role: role || null };
  } else if (fromId && fromId !== user.id) {
    const sender = (await listMemoSenders(companyId)).find((x) => x.id === fromId);
    if (!sender) return { error: "That person is not in your office team. Choose again." };
    from = { profileId: sender.id, name: sender.name, role: sender.title || null };
  }

  const supabase = await createClient();
  const audience = await resolveBriefingAudience(supabase, companyId, {
    scope: input?.scope,
    branchId: input?.branchId,
    personIds: Array.isArray(input?.personIds) ? input.personIds : [],
  });
  if (!audience.ok) return { error: audience.error };

  // Every file is checked against what actually arrived in the bucket, under THIS notice.
  const service = createServiceClient();
  const files: NoticeFile[] = [];
  if (fileRefs.length > 0) {
    const { data: listed, error: listErr } = await service.storage
      .from(EVIDENCE_BUCKET)
      .list(`${companyId}/notices/${noticeId}`, { limit: 20 });
    if (listErr) return { error: `The files could not be checked: ${listErr.message}` };
    const arrived = new Map(
      ((listed ?? []) as Array<{ name: string; metadata: { size?: number } | null }>).map((o) => [o.name, o]),
    );
    for (let i = 0; i < fileRefs.length; i++) {
      const name = String(fileRefs[i]?.name ?? "");
      const path = String(fileRefs[i]?.path ?? "");
      if (path !== noticeFilePath(companyId, noticeId, i + 1, name)) {
        return { error: "A file is not part of this briefing. Start again." };
      }
      const object = arrived.get(path.split("/").pop() as string);
      if (!object) return { error: `${name} did not arrive. Try again.` };
      const size = Number(object.metadata?.size ?? 0);
      const fileProblem = noticeFileProblem({ name, size });
      if (fileProblem) return { error: fileProblem };
      files.push({ path, name, size, type: noticeMimeType(name) });
    }
  }

  const { error: noticeErr } = await supabase.from("briefing_notices").insert({
    id: noticeId,
    company_id: companyId,
    kind,
    title,
    body: body || null,
    files,
    response,
    created_by: user.id,
    from_profile_id: from?.profileId ?? null,
    from_name: from?.name ?? null,
    from_role: from?.role ?? null,
  });
  if (noticeErr) {
    // The same notice sent twice (a double tap, a retry): the first one stands.
    if (noticeErr.code === "23505") return { ok: "That has already been sent." };
    return { error: noticeErr.message };
  }

  const { data: rows, error } = await supabase
    .from("assignments")
    .insert(
      audience.personIds.map((personId) => ({
        company_id: companyId,
        person_id: personId,
        kind: "notice",
        notice_id: noticeId,
        due_date: dueDate,
        assigned_by: user.id,
      })),
    )
    .select("id, person_id");
  if (error) return { error: error.message };
  const created = rows?.length ?? 0;

  // Copies in the company's cloud drive (0437): the memo PDF and every file, into Briefings.
  await queueCloudCopy({ companyId, kind: "notice", sourceId: noticeId });
  for (let i = 0; i < files.length; i++) {
    await queueCloudCopy({ companyId, kind: "notice_file", sourceId: `${noticeId}|${i + 1}` });
  }

  const emailOutcome = await notifyBriefingSent({
    companyId,
    kind: "notice",
    title,
    dueDate,
    notice: { kind, response, fileCount: files.length, from: from ? (from.role ? `${from.name}, ${from.role}` : from.name) : null },
    assignments: ((rows ?? []) as Array<{ id: string; person_id: string }>).map((r) => ({ id: r.id, personId: r.person_id })),
  });

  // The office team's copy. Anyone who got it as a person is not copied as well.
  let officeCopy = { emailed: 0, muted: 0, failed: 0 };
  if (input?.copyOffice === true) {
    const ids = audience.personIds;
    const { data: linked } = await createServiceClient()
      .from("people")
      .select("profile_id")
      .in("id", ids)
      .not("profile_id", "is", null);
    officeCopy = await emailOfficeCopy({
      companyId,
      noticeId,
      senderProfileId: user.id,
      senderName: from?.name || profile.full_name || "Your manager",
      noticeKind: kind,
      title,
      bodyHtml: noticeEmailBodyHtml(parseNoticeText(body)),
      fileCount: files.length,
      sentTo: created,
      alreadyEmailedProfileIds: ((linked ?? []) as Array<{ profile_id: string }>).map((r) => r.profile_id),
    });
  }

  await writeAudit({
    companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "briefing.notice_sent",
    entityType: "briefing_notice",
    entityId: noticeId,
    summary: `Sent a ${NOTICE_KIND_LABELS[kind].toLowerCase()} "${title}" to ${created} ${created === 1 ? "person" : "people"}`,
    metadata: {
      kind,
      response,
      scope: audience.scope,
      branch_id: audience.branchId,
      people: created,
      files: files.length,
      due_date: dueDate,
      emailed: emailOutcome.emailed,
      no_email: emailOutcome.noEmail,
      email_failed: emailOutcome.failed,
      office_copy: input?.copyOffice === true,
      office_copied: officeCopy.emailed,
      on_behalf_of: from ? from.name : null,
    },
  });

  revalidatePath("/briefings");
  const parts = [`Sent to ${created} ${created === 1 ? "person" : "people"}.`];
  if (emailOutcome.emailed > 0) parts.push(`${emailOutcome.emailed} emailed.`);
  if (emailOutcome.noEmail > 0) {
    parts.push(
      `${emailOutcome.noEmail} ${emailOutcome.noEmail === 1 ? "has" : "have"} no email address, so they will only see it when they log in.`,
    );
  }
  if (emailOutcome.muted > 0) {
    parts.push("Emails are switched off for this test company, so nobody was emailed.");
  }
  const failedForReal = emailOutcome.failed - emailOutcome.muted;
  if (failedForReal > 0) parts.push(`${failedForReal} could not be emailed.`);
  if (input?.copyOffice === true) {
    if (officeCopy.emailed > 0) {
      parts.push(`Office team copied: ${officeCopy.emailed} ${officeCopy.emailed === 1 ? "person" : "people"}.`);
    } else if (officeCopy.muted > 0) {
      parts.push("The office team copy was not sent because emails are switched off for this test company.");
    } else if (officeCopy.failed === 0) {
      parts.push("Nobody else in the office team has an email address to copy.");
    }
    if (officeCopy.failed > 0) parts.push(`${officeCopy.failed} office team ${officeCopy.failed === 1 ? "copy" : "copies"} could not be sent.`);
  }
  return { ok: parts.join(" ") };
}

/** The person opens it. Safe to call on every opening. */
export async function openNotice(assignmentId: string): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { ok: false, error: "No company context." };
  if (!UUID.test(String(assignmentId ?? ""))) return { ok: false, error: "That briefing could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_briefing_notice", { p_assignment_id: assignmentId });
  if (error) return { ok: false, error: error.message };
  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "briefing.notice_opened",
    entityType: "assignment",
    entityId: assignmentId,
    summary: "Opened a briefing",
  });
  if (data === "completed") revalidatePath("/briefings");
  return { ok: true, status: String(data ?? "") };
}

/** "I have read this". */
export async function confirmNotice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const assignmentId = String(formData.get("assignment_id") ?? "");
  if (!UUID.test(assignmentId)) return { error: "That briefing could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_briefing_notice", { p_assignment_id: assignmentId });
  if (error) return { error: error.message };
  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "briefing.notice_confirmed",
    entityType: "assignment",
    entityId: assignmentId,
    summary: "Confirmed they had read a briefing",
  });
  revalidatePath("/my");
  revalidatePath("/briefings");
  return { ok: "Thank you. Your manager can see you have read it." };
}

/** Sign it. Filed as Evidence through the Policy Acknowledgement form, exactly like a policy. */
export async function signNotice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const assignmentId = String(formData.get("assignment_id") ?? "");
  if (!UUID.test(assignmentId)) return { error: "That briefing could not be found." };

  let answers: Answers;
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}")) as Answers;
  } catch {
    return { error: "Could not read your signature. Please try again." };
  }

  const supabase = await createClient();
  const { data: a } = await supabase
    .from("assignments")
    .select(
      "id, company_id, person_id, kind, status, briefing_notices:notice_id(kind, title, response), people:person_id(full_name, branch_id, profile_id)",
    )
    .eq("id", assignmentId)
    .maybeSingle();
  if (!a || a.kind !== "notice") return { error: "That briefing could not be found." };
  if (a.status !== "assigned") return { error: "That is already signed." };
  const notice = (Array.isArray(a.briefing_notices) ? a.briefing_notices[0] : a.briefing_notices) as
    | { kind: string; title: string; response: string }
    | null;
  const person = (Array.isArray(a.people) ? a.people[0] : a.people) as
    | { full_name: string; branch_id: string | null; profile_id: string | null }
    | null;
  if (!notice || notice.response !== "sign") return { error: "This one does not need a signature." };
  // Only the person it was sent to signs it. A manager cannot sign on their behalf.
  if (person?.profile_id !== user.id) return { error: "Only the person it was sent to can sign it." };

  const config = await getPolicyConfig(a.company_id as string);
  const mode = config.signature_mode as SignatureMode;
  const signed = signatureGiven(answers, mode);
  if (!signed.ok) return { error: signed.error };
  if (answers["confirmed"] !== true) return { error: "Tick the box to confirm you have read it." };

  const form = await getCompanyFormByKey(a.company_id as string, POLICY_ACK_FORM_KEY);
  if (!form) return { error: "Signing is not set up for your company yet. Please tell your manager." };

  const drawn = typeof answers[DRAWN_KEY] === "string" ? (answers[DRAWN_KEY] as string) : "";
  const typed = typeof answers[TYPED_KEY] === "string" ? (answers[TYPED_KEY] as string).trim() : "";
  const files: EvidenceFileInput[] = [];
  const png = drawn ? dataUrlToPngBuffer(drawn) : null;
  if (png) {
    files.push({ fieldKey: DRAWN_KEY, kind: "signature", fileName: "signature.png", contentType: "image/png", bytes: png });
  }
  const label = isNoticeKind(notice.kind) ? NOTICE_KIND_LABELS[notice.kind] : "Briefing";
  const stamped: Answers = {
    ...answers,
    policy: `${label}: ${notice.title}`,
    policy_version: "1",
    name: person?.full_name ?? profile.full_name,
    read_date: new Date().toISOString().slice(0, 10),
    [DRAWN_KEY]: png ? "signature.png" : "",
    [TYPED_KEY]: typed,
  };

  const result = await submitEvidence({
    formVersionId: form.versionId,
    branchId: person?.branch_id ?? null,
    answers: stamped,
    files,
    recordType: "person",
    recordId: a.person_id as string,
    evidenceId: randomUUID(),
  });
  if (!result.ok) return { error: result.error };

  const { error: rpcErr } = await supabase.rpc("complete_assignment", {
    p_assignment_id: assignmentId,
    p_evidence_id: result.evidenceId,
  });
  if (rpcErr) return { error: `Your signature was saved, but the briefing did not close: ${rpcErr.message}` };

  await writeAudit({
    companyId: a.company_id as string,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "briefing.notice_signed",
    entityType: "assignment",
    entityId: assignmentId,
    summary: `Signed "${notice.title}"`,
    metadata: { evidence_id: result.evidenceId, signature: png ? "drawn" : "typed" },
  });

  revalidatePath("/my");
  revalidatePath("/briefings");
  return { ok: "Signed, thank you." };
}

/** Withdraw a memo, message or attachment from everyone who has not done it yet. */
export async function withdrawNotice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const s = await sender();
  if ("error" in s) return { error: s.error as string };
  const noticeId = String(formData.get("notice_id") ?? "");
  if (!UUID.test(noticeId)) return { error: "That briefing could not be found." };
  const supabase = await createClient();
  // RLS limits this to the people the caller looks after, so a Branch Manager withdraws it from
  // their own branch only.
  const { data, error } = await supabase
    .from("assignments")
    .update({ status: "cancelled" })
    .eq("company_id", s.companyId)
    .eq("notice_id", noticeId)
    .eq("status", "assigned")
    .select("id");
  if (error) return { error: error.message };
  const n = data?.length ?? 0;
  if (n === 0) return { error: "There is nobody left to withdraw it from." };
  await writeAudit({
    companyId: s.companyId,
    actorId: s.user.id,
    actorEmail: s.profile.email,
    actorRole: s.profile.role,
    action: "briefing.notice_withdrawn",
    entityType: "briefing_notice",
    entityId: noticeId,
    summary: `Withdrew a briefing from ${n} ${n === 1 ? "person" : "people"}`,
  });
  revalidatePath("/briefings");
  return { ok: `Withdrawn from ${n} ${n === 1 ? "person" : "people"}.` };
}
