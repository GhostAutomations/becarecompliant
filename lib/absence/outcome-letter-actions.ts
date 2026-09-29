"use server";

/**
 * Be Care Compliant — the absence meeting outcome letter (Phil, 2026-09-29, Absence round 2 item 3).
 *
 *   draftOutcomeLetter    AI writes the middle from the meeting's Evidence. Saved at once, so
 *                         reopening never spends a second credit.
 *   previewOutcomeLetter  the whole letter, exactly as it will be emailed, read only. Sends nothing.
 *   sendOutcomeLetter     Approve and send: the PDF is made and kept on the meeting, and the letter
 *                         is emailed with the PDF attached. No email address: PDF only, marked not
 *                         emailed, for the manager to print and hand over.
 *
 * The company's fixed wording (opening, right of appeal, sign off) is Settings, Letters,
 * "Absence meeting outcome", and wraps the middle through {{outcome_body}}.
 */

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { runAi } from "@/lib/ai/anthropic";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import type { LetterPreviewState } from "@/lib/absence/letter-preview";
import { profilesById } from "@/lib/auth/company-profiles";
import { getAbsenceConfig } from "@/lib/absence/data";
import { stageActionFor } from "@/lib/absence/stage-actions";
import { letterWordingFor } from "@/lib/letters/data";
import { renderLetterHtml, renderLetterSubject } from "@/lib/letters/letters";
import { noticeEmailHtml } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/resend";
import { claimNotification, releaseNotification, settleNotification } from "@/lib/notifications/log";
import { outcomeLetterPath, sha256Hex, uploadOutcomeLetter } from "@/lib/evidence/storage";
import { renderOutcomeLetterPdf } from "@/lib/absence/outcome-letter-pdf";
import { formatCivilDate, todayInLondon } from "@/lib/recurrence";
import {
  OUTCOME_SYSTEM,
  buildOutcomePrompt,
  cleanOutcomeBody,
  letterParagraphs,
  normaliseApprovedBody,
  outcomeFacts,
  slashDate,
} from "@/lib/absence/outcome-letter";

type Client = Awaited<ReturnType<typeof createClient>>;

type Loaded = {
  supabase: Client;
  companyId: string;
  companyName: string;
  meeting: {
    id: string;
    branch_id: string | null;
    person_id: string;
    stage: number | null;
    meeting_date: string | null;
    meeting_time: string | null;
    duration_minutes: number | null;
    location: string | null;
    evidence_id: string;
    conducted_by: string | null;
    recorded_by: string | null;
  };
  answers: Record<string, unknown>;
  employee: { name: string; email: string | null; profileId: string | null };
  conductorName: string;
  letter: {
    id: string;
    status: string;
    draft_body: string | null;
    approved_body: string | null;
  } | null;
};

async function load(meetingId: string, companyId: string): Promise<Loaded | { error: string }> {
  if (!meetingId) return { error: "Missing meeting." };
  const supabase = await createClient();
  const { data: m } = await supabase
    .from("absence_meetings")
    .select("id, company_id, branch_id, person_id, stage, meeting_date, meeting_time, duration_minutes, location, evidence_id, conducted_by, recorded_by")
    .eq("id", meetingId)
    .maybeSingle();
  if (!m || m.company_id !== companyId) return { error: "That meeting could not be found." };
  if (!m.evidence_id) return { error: "Record the meeting first, then write its outcome letter." };
  const { data: allowed } = await supabase.rpc("can_prepare_absence_meeting", { p_person_id: m.person_id });
  if (allowed !== true) return { error: "You cannot write letters for this person's meetings." };

  const [{ data: ev }, { data: person }, { data: company }, { data: letter }] = await Promise.all([
    supabase.from("evidence").select("answers").eq("id", m.evidence_id).maybeSingle(),
    supabase.from("people").select("full_name, work_email, profile_id").eq("id", m.person_id).maybeSingle(),
    supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
    supabase.from("absence_outcome_letters").select("id, status, draft_body, approved_body").eq("meeting_id", meetingId).maybeSingle(),
  ]);
  const answers = ((ev as { answers?: Record<string, unknown> } | null)?.answers ?? {}) as Record<string, unknown>;

  let email = (person?.work_email as string | null) ?? null;
  const profiles = await profilesById([
    (person?.profile_id as string | null) ?? null,
    (m.conducted_by as string | null) ?? null,
    (m.recorded_by as string | null) ?? null,
  ]);
  if (!email && person?.profile_id) email = profiles.get(person.profile_id as string)?.email ?? null;
  const conductorName =
    (m.conducted_by ? profiles.get(m.conducted_by as string)?.name : null) ||
    (typeof answers.manager_conducting === "string" && answers.manager_conducting.trim()) ||
    (m.recorded_by ? profiles.get(m.recorded_by as string)?.name : null) ||
    "your manager";

  return {
    supabase,
    companyId,
    companyName: (company?.name as string | undefined) ?? "your employer",
    meeting: {
      id: m.id as string,
      branch_id: (m.branch_id as string | null) ?? null,
      person_id: m.person_id as string,
      stage: (m.stage as number | null) ?? null,
      meeting_date: (m.meeting_date as string | null) ?? null,
      meeting_time: (m.meeting_time as string | null) ?? null,
      duration_minutes: (m.duration_minutes as number | null) ?? null,
      location: (m.location as string | null) ?? null,
      evidence_id: m.evidence_id as string,
      conducted_by: (m.conducted_by as string | null) ?? null,
      recorded_by: (m.recorded_by as string | null) ?? null,
    },
    answers,
    employee: {
      name: (person?.full_name as string | undefined) ?? "the employee",
      email,
      profileId: (person?.profile_id as string | null) ?? null,
    },
    conductorName,
    letter: (letter as Loaded["letter"]) ?? null,
  };
}

const FINAL = new Set(["sent", "not_emailed"]);

/** Build the whole letter: subject, email HTML and the plain paragraphs the PDF prints. */
async function compose(ctx: Loaded, body: string) {
  const wording = await letterWordingFor(ctx.supabase, ctx.companyId, "absence_meeting_outcome");
  const stageLabel = ctx.meeting.stage
    ? `Stage ${ctx.meeting.stage} absence management meeting`
    : "absence management meeting";
  const meetingDate = slashDate(ctx.meeting.meeting_date);
  const time = ctx.meeting.meeting_time ? String(ctx.meeting.meeting_time).slice(0, 5) : "";
  const config = await getAbsenceConfig(ctx.companyId);
  const letterDate = slashDate(formatCivilDate(todayInLondon()));
  const values: Record<string, string> = {
    recipient_name: ctx.employee.name,
    employee_name: ctx.employee.name,
    company_name: ctx.companyName,
    stage: ctx.meeting.stage ? String(ctx.meeting.stage) : "",
    stage_label: stageLabel,
    stage_action: stageActionFor(config, ctx.meeting.stage) ?? "",
    stage_action_sentence: "",
    conductor_name: ctx.conductorName,
    meeting_date: meetingDate,
    meeting_time: time,
    meeting_when: time ? `${meetingDate} at ${time}` : meetingDate,
    location: ctx.meeting.location ?? "",
    duration: ctx.meeting.duration_minutes ? `${ctx.meeting.duration_minutes} minutes` : "",
    outcome_body: body,
    letter_date: letterDate,
  };
  const subject = renderLetterSubject(wording.subject, values) || `Outcome of your ${stageLabel}`;
  const html = noticeEmailHtml({
    preheader: subject,
    heading: subject,
    bodyHtml: `<p style="margin:0 0 10px 0;">${letterDate}</p>${renderLetterHtml(wording.body, values)}`,
    footerNote: `This letter is attached as a PDF for you to keep. It is sent on behalf of ${ctx.companyName}.`,
  });
  const paragraphs = letterParagraphs(wording.body, values);
  return { subject, html, paragraphs, letterDate };
}

/** AI drafts the middle of the letter. Returns the saved draft without spending when there is one. */
export async function draftOutcomeLetter(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const ctx = await load(String(formData.get("meeting_id") ?? ""), profile.company_id);
  if ("error" in ctx) return { error: ctx.error };
  if (ctx.letter && FINAL.has(ctx.letter.status)) return { error: "This meeting's outcome letter has already gone." };
  // A send that failed hands back what was approved; otherwise the saved draft. Either way, free.
  const kept = ctx.letter?.approved_body || ctx.letter?.draft_body;
  if (kept) return { ok: "Drafted", data: { body: kept } };

  const config = await getAbsenceConfig(ctx.companyId);
  const result = await runAi({
    companyId: ctx.companyId,
    feature: "absence_outcome_letter",
    system: OUTCOME_SYSTEM,
    prompt: buildOutcomePrompt({
      stage: ctx.meeting.stage,
      stageAction: stageActionFor(config, ctx.meeting.stage),
      facts: outcomeFacts(ctx.answers),
    }),
    maxTokens: 1200,
  });
  if ("error" in result) return { error: result.error };
  const body = cleanOutcomeBody(result.ok);
  if (!body) return { error: "The AI's reply came back empty. Try again, or write the outcome yourself." };

  if (ctx.letter) {
    await ctx.supabase
      .from("absence_outcome_letters")
      .update({ draft_body: body, drafted_by: profile.id, drafted_by_name: profile.full_name, drafted_at: new Date().toISOString() })
      .eq("id", ctx.letter.id);
  } else {
    const { error } = await ctx.supabase.from("absence_outcome_letters").insert({
      company_id: ctx.companyId,
      person_id: ctx.meeting.person_id,
      branch_id: ctx.meeting.branch_id,
      meeting_id: ctx.meeting.id,
      evidence_id: ctx.meeting.evidence_id,
      draft_body: body,
      drafted_by: profile.id,
      drafted_by_name: profile.full_name,
      drafted_at: new Date().toISOString(),
    });
    if (error) {
      // Two people at once: the first draft wins and both see it.
      const { data: won } = await ctx.supabase
        .from("absence_outcome_letters")
        .select("draft_body")
        .eq("meeting_id", ctx.meeting.id)
        .maybeSingle();
      if (won?.draft_body) return { ok: "Drafted", data: { body: won.draft_body as string } };
    }
  }
  return { ok: "Drafted", data: { body } };
}

/** The whole letter as it will go, read only. Nothing is saved or sent. */
export async function previewOutcomeLetter(formData: FormData): Promise<LetterPreviewState> {
  const { profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const ctx = await load(String(formData.get("meeting_id") ?? ""), profile.company_id);
  if ("error" in ctx) return { error: ctx.error };
  if (ctx.letter && FINAL.has(ctx.letter.status)) return { error: "This meeting's outcome letter has already gone." };
  const body = normaliseApprovedBody(formData.get("body"));
  if (!body) return { error: "Write the outcome, or draft it, before checking the letter." };
  const letter = await compose(ctx, body);
  return {
    letters: [
      {
        key: "employee",
        who: "Employee",
        name: ctx.employee.name,
        to: ctx.employee.email,
        subject: letter.subject,
        html: letter.html,
        note: ctx.employee.email
          ? "The letter as a PDF, which is also kept on the meeting."
          : null,
        unsentNote: ctx.employee.email
          ? undefined
          : `${ctx.employee.name} has no email address, so this letter will not be emailed. Approving keeps it as a PDF on the meeting, marked not emailed, for you to print and hand to them.`,
      },
    ],
  };
}

/** Approve and send. Final: once it has gone it cannot be changed. */
export async function sendOutcomeLetter(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, profile } = await requireCompany();
  if (!profile.company_id) return { error: "No company context." };
  const ctx = await load(String(formData.get("meeting_id") ?? ""), profile.company_id);
  if ("error" in ctx) return { error: ctx.error };
  if (ctx.letter && FINAL.has(ctx.letter.status)) return { error: "This meeting's outcome letter has already gone." };
  const body = normaliseApprovedBody(formData.get("body"));
  if (!body) return { error: "Write the outcome, or draft it, before sending the letter." };

  // A letter written by hand with no draft behind it still needs its row.
  let letterId = ctx.letter?.id ?? null;
  if (!letterId) {
    const { data, error } = await ctx.supabase
      .from("absence_outcome_letters")
      .insert({
        company_id: ctx.companyId,
        person_id: ctx.meeting.person_id,
        branch_id: ctx.meeting.branch_id,
        meeting_id: ctx.meeting.id,
        evidence_id: ctx.meeting.evidence_id,
      })
      .select("id")
      .single();
    if (error || !data) return { error: `The letter could not be saved: ${error?.message ?? "no id"}` };
    letterId = data.id as string;
  }

  const letter = await compose(ctx, body);
  const letterText = [letter.letterDate, letter.subject, ...letter.paragraphs].join("\n\n");

  // The PDF first: it is the copy kept on the meeting whatever happens to the email.
  let pdf: Buffer;
  try {
    pdf = await renderOutcomeLetterPdf({
      companyName: ctx.companyName,
      letterDate: letter.letterDate,
      subject: letter.subject,
      paragraphs: letter.paragraphs,
    });
  } catch (e) {
    return { error: `The letter's PDF could not be made: ${(e as Error).message}` };
  }
  const path = outcomeLetterPath(ctx.companyId, ctx.meeting.evidence_id);
  const up = await uploadOutcomeLetter(path, pdf);
  if (!up.ok) return { error: `The letter's PDF could not be stored: ${up.error}` };

  let status: "sent" | "not_emailed" | "send_failed" = "not_emailed";
  let emailError: string | null = null;
  if (ctx.employee.email) {
    const logId = await claimNotification({
      companyId: ctx.companyId,
      branchId: ctx.meeting.branch_id,
      recipientProfileId: ctx.employee.profileId,
      channel: "email",
      kind: "absence_outcome_letter",
      dedupeKey: `absence_outcome_letter:${ctx.meeting.id}`,
      toAddress: ctx.employee.email,
      subject: letter.subject,
    });
    if (!logId) {
      status = "send_failed";
      emailError = "This letter is already being sent. Wait a moment and refresh.";
    } else {
      const result = await sendEmail({
        to: ctx.employee.email,
        subject: letter.subject,
        html: letter.html,
        attachments: [
          { filename: "outcome-letter.pdf", content: pdf.toString("base64"), contentType: "application/pdf" },
        ],
      });
      if (result.sent) {
        status = "sent";
        await settleNotification(logId, "sent");
      } else {
        status = "send_failed";
        emailError = result.skippedReason
          ? "Email is not set up for this service (RESEND_API_KEY / RESEND_FROM)."
          : `The email could not be sent: ${result.error ?? "unknown error"}`;
        // Given back so Approve and send can try again; the attempt is in the audit log below.
        await releaseNotification(logId);
      }
    }
  }

  const now = new Date().toISOString();
  const { error: updErr } = await ctx.supabase
    .from("absence_outcome_letters")
    .update({
      status,
      approved_body: body,
      subject: letter.subject,
      letter_text: letterText,
      approved_by: profile.id,
      approved_by_name: profile.full_name,
      approved_at: now,
      emailed_to: status === "sent" ? ctx.employee.email : null,
      emailed_at: status === "sent" ? now : null,
      email_error: emailError,
      pdf_path: path,
      pdf_sha256: sha256Hex(pdf),
    })
    .eq("id", letterId);
  if (updErr) return { error: `The letter went out but could not be recorded: ${updErr.message}` };

  await writeAudit({
    companyId: ctx.companyId,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: status === "sent" ? "absence.outcome_letter_sent" : status === "not_emailed" ? "absence.outcome_letter_kept" : "absence.outcome_letter_failed",
    entityType: "person",
    entityId: ctx.meeting.person_id,
    summary:
      status === "sent"
        ? `Sent the outcome letter for the ${ctx.meeting.stage ? `Stage ${ctx.meeting.stage} ` : ""}absence meeting to ${ctx.employee.email}`
        : status === "not_emailed"
          ? "Kept the absence meeting outcome letter as a PDF to hand over (no email address)"
          : "The absence meeting outcome letter could not be emailed",
    metadata: { meeting_id: ctx.meeting.id, letter_id: letterId, status, error: emailError },
  });

  revalidatePath("/people/absence");
  revalidatePath(`/people/${ctx.meeting.person_id}`);
  if (status === "send_failed") {
    return { error: `The PDF is kept on the meeting, but ${emailError?.replace(/^The email/, "the email") ?? "the email could not be sent"} Press Approve and send to try again.` };
  }
  return {
    ok:
      status === "sent"
        ? `Letter sent to ${ctx.employee.email}, with the PDF attached. The PDF is kept on the meeting.`
        : "Letter kept as a PDF on the meeting, marked not emailed. Download it to print and hand over.",
  };
}
